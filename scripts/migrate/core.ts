/**
 * Pure (I/O-free) logic for migrating the legacy Streamlit data:
 *   data/APT_Production_Master.xlsx  → components
 *   storage/<machine>.csv            → production_entries (source = legacy_import)
 *   storage/logs/<machine>.log       → operator / entered-by names for those rows
 * Nothing here guesses: anything that cannot be mapped unambiguously becomes a
 * discrepancy for a human to resolve.
 */
import { createHash } from "node:crypto";

export const LEGACY_MACHINES: Record<string, string> = { vim1: "VIM1", vim2: "VIM2", vim3: "VIM3", vim4: "VIM4", him: "HIM" };
export const LEGACY_CSV_COLUMNS = ["log_datetime", "component_name", "component_id", "quantity"];
const TEST_MARKER = /\b(test|testing|dummy|sample|demo|asdf|xxx)\b/i;

export type Severity = "error" | "warning" | "info";
export interface Discrepancy {
  severity: Severity;
  source: string; // file name
  line: number | null; // 1-based line / row number in the source file
  code: string;
  message: string;
  raw?: unknown;
}

// ----------------------------------------------------------------- components
export interface MasterRow {
  row: number;
  component_name: unknown;
  component_id: unknown;
  ZohoID: unknown;
}
export interface ItemExportRow {
  itemId: string;
  productType: string | null;
  status: string | null;
  name: string | null;
}
export interface ComponentRecord {
  zoho_item_id: string;
  component_name: string;
  component_code: string | null;
  product_type: string | null;
  is_active: boolean;
  description: string | null;
}

const cellText = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v !== null && "richText" in v) return ((v as { richText: { text: string }[] }).richText ?? []).map((t) => t.text).join("");
  if (typeof v === "object" && v !== null && "text" in v) return String((v as { text: unknown }).text ?? "");
  if (typeof v === "object" && v !== null && "result" in v) return String((v as { result: unknown }).result ?? "");
  return String(v);
};

export function mapComponents(master: MasterRow[], items: ItemExportRow[] | null, source = "APT_Production_Master.xlsx") {
  const issues: Discrepancy[] = [];
  const records: ComponentRecord[] = [];
  const byZoho = new Map<string, number>();
  const byName = new Map<string, number>();
  const itemMap = new Map((items ?? []).map((i) => [i.itemId, i]));
  const codeCount = new Map<string, number>();

  for (const r of master) {
    const code = cellText(r.component_id).trim();
    if (code) codeCount.set(code, (codeCount.get(code) ?? 0) + 1);
  }

  let blank = 0;
  for (const r of master) {
    const name = cellText(r.component_name).replace(/\s+/g, " ").trim();
    const zoho = cellText(r.ZohoID).trim();
    const code = cellText(r.component_id).trim();
    if (!name && !zoho && !code) {
      blank++;
      continue;
    }
    if (!name) {
      issues.push({ severity: "error", source, line: r.row, code: "MISSING_NAME", message: "Row has no component_name", raw: r });
      continue;
    }
    if (!/^\d{5,25}$/.test(zoho)) {
      issues.push({ severity: "error", source, line: r.row, code: "MISSING_ZOHO_ID", message: `“${name}” has no valid ZohoID — cannot key it reliably`, raw: r });
      continue;
    }
    if (byZoho.has(zoho)) {
      issues.push({ severity: "error", source, line: r.row, code: "DUPLICATE_ZOHO_ID", message: `ZohoID ${zoho} also on row ${byZoho.get(zoho)}`, raw: r });
      continue;
    }
    const nameKey = name.toLowerCase();
    if (byName.has(nameKey)) {
      issues.push({ severity: "error", source, line: r.row, code: "DUPLICATE_NAME", message: `“${name}” also on row ${byName.get(nameKey)}`, raw: r });
      continue;
    }
    byZoho.set(zoho, r.row);
    byName.set(nameKey, r.row);

    const item = itemMap.get(zoho);
    let productType: string | null = null;
    let active = true;
    if (items) {
      if (!item) {
        issues.push({ severity: "warning", source, line: r.row, code: "NOT_IN_ZOHO_EXPORT", message: `“${name}” (${zoho}) is not in the Zoho item export; imported as active` });
      } else {
        productType = item.productType;
        if (item.productType && item.productType.toLowerCase() !== "goods") {
          active = false;
          issues.push({ severity: "info", source, line: r.row, code: "SERVICE_ITEM_INACTIVE", message: `“${name}” is a Zoho ${item.productType} item; imported as INACTIVE (admin can activate)` });
        }
        if (item.status && item.status.toLowerCase() !== "active") {
          active = false;
          issues.push({ severity: "info", source, line: r.row, code: "ZOHO_INACTIVE", message: `“${name}” is ${item.status} in Zoho; imported as INACTIVE` });
        }
        if (item.name && item.name.replace(/\s+/g, " ").trim().toLowerCase() !== nameKey) {
          issues.push({ severity: "warning", source, line: r.row, code: "NAME_DIFFERS_FROM_ZOHO", message: `Master “${name}” vs Zoho “${item.name}” — master name kept` });
        }
      }
    }
    if (!code) {
      issues.push({ severity: "info", source, line: r.row, code: "MISSING_PART_CODE", message: `“${name}” has no component_id (part code); imported without one` });
    } else if ((codeCount.get(code) ?? 0) > 1) {
      issues.push({ severity: "info", source, line: r.row, code: "SHARED_PART_CODE", message: `Part code “${code}” is used by ${codeCount.get(code)} rows; it is stored as-is but not used as a key` });
    }
    records.push({
      zoho_item_id: zoho,
      component_name: name,
      component_code: code ? code.replace(/\s*\n\s*/g, " / ") : null,
      product_type: productType,
      is_active: active,
      description: null,
    });
  }
  return { records, issues, blankRows: blank };
}

// ----------------------------------------------------------------- production
export interface LegacyCsvRow {
  file: string;
  line: number;
  values: Record<string, string>;
}
export interface LegacyLogLine {
  file: string;
  line: number;
  systemTime: string;
  enteredBy: string;
  operator: string;
  prodTime: string;
  componentId: string;
  qty: string;
  machine: string;
}
export interface ComponentLookup {
  id: string;
  component_name: string;
  component_code: string | null;
}
export interface ProductionRecord {
  import_key: string;
  machine_code: string;
  component_id: string;
  production_date: string;
  hour_slot: number;
  quantity: number;
  legacy_operator_name: string;
  legacy_entered_by_name: string | null;
  legacy_raw: Record<string, unknown>;
  notes: string | null;
}

const LOG_RE =
  /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] EnteredBy:(.*?) \| Operator:(.*?) \| ProdTime:(\d{4}-\d{2}-\d{2} \d{2}:\d{2}) \| Component:(.*?) \| Qty:(.*?) \| Machine:(\w+) \| File:/;

export function parseLogLines(file: string, text: string): { lines: LegacyLogLine[]; issues: Discrepancy[] } {
  const lines: LegacyLogLine[] = [];
  const issues: Discrepancy[] = [];
  text.split(/\r?\n/).forEach((l, i) => {
    if (!l.trim()) return;
    const m = LOG_RE.exec(l);
    if (!m) {
      issues.push({ severity: "warning", source: file, line: i + 1, code: "UNPARSEABLE_LOG_LINE", message: "Log line does not match the legacy format", raw: l });
      return;
    }
    lines.push({ file, line: i + 1, systemTime: m[1]!, enteredBy: m[2]!.trim(), operator: m[3]!.trim(), prodTime: m[4]!, componentId: m[5]!.trim(), qty: m[6]!.trim(), machine: m[7]!.toLowerCase() });
  });
  return { lines, issues };
}

/** Minimal RFC-4180 CSV parser (pandas output: quoted fields may contain commas/newlines). */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (q) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field); out.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); out.push(row); }
  return out.filter((r) => !(r.length === 1 && r[0] === ""));
}

export function readLegacyCsv(file: string, text: string): { rows: LegacyCsvRow[]; issues: Discrepancy[] } {
  const issues: Discrepancy[] = [];
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], issues: [{ severity: "warning", source: file, line: null, code: "EMPTY_FILE", message: "File is empty" }] };
  const header = table[0]!.map((h) => h.trim());
  const missing = LEGACY_CSV_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) {
    return { rows: [], issues: [{ severity: "error", source: file, line: 1, code: "BAD_HEADER", message: `Missing column(s): ${missing.join(", ")}`, raw: header }] };
  }
  const extra = header.filter((h) => !LEGACY_CSV_COLUMNS.includes(h));
  if (extra.length) issues.push({ severity: "warning", source: file, line: 1, code: "EXTRA_COLUMNS", message: `Unexpected column(s) kept in legacy_raw: ${extra.join(", ")}` });
  const rows = table.slice(1).map((cells, i) => {
    const values: Record<string, string> = {};
    header.forEach((h, j) => (values[h] = (cells[j] ?? "").trim()));
    if (cells.length !== header.length) {
      issues.push({ severity: "error", source: file, line: i + 2, code: "COLUMN_COUNT", message: `Expected ${header.length} fields, found ${cells.length}`, raw: cells });
      values.__bad = "1";
    }
    return { file, line: i + 2, values };
  });
  return { rows, issues };
}

export function importKey(machine: string, v: Record<string, string>, occurrence: number): string {
  return "legacy:" + createHash("sha256")
    .update([machine, v.log_datetime, v.component_name, v.component_id, v.quantity, occurrence].join("␟"))
    .digest("hex")
    .slice(0, 40);
}

export function mapProduction(
  csvRows: LegacyCsvRow[],
  logLines: LegacyLogLine[],
  components: ComponentLookup[],
  opts: { includeFlagged?: boolean } = {},
) {
  const issues: Discrepancy[] = [];
  const records: ProductionRecord[] = [];
  const byName = new Map<string, ComponentLookup>();
  for (const c of components) byName.set(c.component_name.replace(/\s+/g, " ").trim().toLowerCase(), c);
  const byCode = new Map<string, ComponentLookup[]>();
  for (const c of components) if (c.component_code) byCode.set(c.component_code.trim(), [...(byCode.get(c.component_code.trim()) ?? []), c]);

  // Logs keyed by the fields both files share. A key can repeat; consume in order.
  const logPool = new Map<string, LegacyLogLine[]>();
  for (const l of logLines) {
    const k = [l.machine, l.prodTime, l.componentId, l.qty].join("|");
    logPool.set(k, [...(logPool.get(k) ?? []), l]);
  }
  const occurrences = new Map<string, number>();
  const slots = new Map<string, LegacyCsvRow>();
  const slotOf = new Map<ProductionRecord, string>();
  const conflicted = new Set<string>();

  for (const r of csvRows) {
    const v = r.values;
    if (v.__bad) continue;
    const legacyMachine = r.file.replace(/^.*[\\/]/, "").replace(/\.csv$/i, "").toLowerCase();
    const machine = LEGACY_MACHINES[legacyMachine];
    const ctx = { source: r.file, line: r.line, raw: v };
    if (!machine) {
      issues.push({ severity: "error", ...ctx, code: "UNKNOWN_MACHINE", message: `File name “${legacyMachine}” is not a known machine` });
      continue;
    }
    const dt = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})$/.exec(v.log_datetime ?? "");
    if (!dt || Number(dt[2]) > 23 || Number(dt[3]) > 59 || Number.isNaN(Date.parse(`${dt[1]}T00:00:00Z`))) {
      issues.push({ severity: "error", ...ctx, code: "BAD_DATETIME", message: `log_datetime “${v.log_datetime}” is not YYYY-MM-DD HH:MM` });
      continue;
    }
    if (!/^\d+$/.test(v.quantity ?? "") || Number(v.quantity) < 1 || Number(v.quantity) > 1000000) {
      issues.push({ severity: "error", ...ctx, code: "BAD_QUANTITY", message: `quantity “${v.quantity}” is not a whole number ≥ 1` });
      continue;
    }

    // Pair with its audit-log line first, so a rejected row still consumes its log entry.
    const logKey = [legacyMachine, v.log_datetime, v.component_id, v.quantity].join("|");
    const log = logPool.get(logKey)?.shift();
    if (!log) {
      issues.push({ severity: "error", ...ctx, code: "NO_LOG_MATCH", message: "No matching audit-log line, so the operator is unknown" });
      continue;
    }

    // Component: exact name first (the legacy app selected by name), then a unique part code.
    let comp = byName.get((v.component_name ?? "").replace(/\s+/g, " ").trim().toLowerCase());
    if (!comp && v.component_id) {
      const candidates = byCode.get(v.component_id.trim()) ?? [];
      if (candidates.length === 1) {
        comp = candidates[0];
        issues.push({ severity: "warning", ...ctx, code: "MATCHED_BY_PART_CODE", message: `Name “${v.component_name}” not found; matched unique part code ${v.component_id} → “${comp!.component_name}”` });
      } else if (candidates.length > 1) {
        issues.push({ severity: "error", ...ctx, code: "AMBIGUOUS_COMPONENT", message: `Name “${v.component_name}” not found and part code ${v.component_id} matches ${candidates.length} components` });
        continue;
      }
    }
    if (!comp) {
      issues.push({ severity: "error", ...ctx, code: "UNKNOWN_COMPONENT", message: `Component “${v.component_name}” (${v.component_id || "no code"}) is not in the component master` });
      continue;
    }

    const occKey = [machine, v.log_datetime, v.component_name, v.component_id, v.quantity].join("|");
    const occ = (occurrences.get(occKey) ?? 0) + 1;
    occurrences.set(occKey, occ);

    if (TEST_MARKER.test(log.operator) || TEST_MARKER.test(log.enteredBy)) {
      if (!opts.includeFlagged) {
        issues.push({ severity: "warning", ...ctx, code: "LOOKS_LIKE_TEST_DATA", message: `Operator “${log.operator}” / entered by “${log.enteredBy}” looks like test data — not imported (use --include-flagged after checking)` });
        continue;
      }
    }

    const slotKey = [machine, dt[1], dt[2], comp.id].join("|");
    const prior = slots.get(slotKey);
    if (prior) {
      const same = prior.values.quantity === v.quantity;
      if (!same) conflicted.add(slotKey);
      issues.push({
        severity: same ? "warning" : "error", ...ctx,
        code: same ? "DUPLICATE_ROW" : "CONFLICTING_ROW",
        message: same
          ? `Same machine/hour/component/quantity as ${prior.file} line ${prior.line} — a double submission; only the first copy is imported`
          : `Same machine/hour/component as ${prior.file} line ${prior.line} with a different quantity (${prior.values.quantity} vs ${v.quantity}) — needs a decision`,
      });
      continue;
    }
    slots.set(slotKey, r);

    const minute = Number(dt[3]);
    const rec: ProductionRecord = {
      import_key: importKey(machine, v, occ),
      machine_code: machine,
      component_id: comp.id,
      production_date: dt[1]!,
      hour_slot: Number(dt[2]),
      quantity: Number(v.quantity),
      legacy_operator_name: log.operator || "(unknown)",
      legacy_entered_by_name: log.enteredBy || null,
      legacy_raw: { ...v, file: r.file, line: r.line, log_file: log.file, log_line: log.line, logged_at: log.systemTime },
      notes: minute !== 0 ? `Legacy time ${v.log_datetime}` : null,
    };
    records.push(rec);
    slotOf.set(rec, slotKey);
  }

  // Conflicting quantities for one slot: import neither copy until someone decides.
  for (let i = records.length - 1; i >= 0; i--) {
    const key = slotOf.get(records[i]!)!;
    if (conflicted.has(key)) {
      const first = slots.get(key)!;
      issues.push({ severity: "error", source: first.file, line: first.line, code: "CONFLICTING_ROW", message: "First of two conflicting rows for this machine/hour/component — not imported until resolved", raw: first.values });
      records.splice(i, 1);
    }
  }

  for (const [, rest] of logPool) {
    for (const l of rest) {
      issues.push({ severity: "warning", source: l.file, line: l.line, code: "LOG_WITHOUT_CSV_ROW", message: `Log entry ${l.prodTime} ${l.componentId} qty ${l.qty} has no CSV row (not imported)` });
    }
  }
  return { records, issues };
}

export function summariseIssues(issues: Discrepancy[]) {
  const by: Record<string, number> = {};
  for (const i of issues) by[`${i.severity}:${i.code}`] = (by[`${i.severity}:${i.code}`] ?? 0) + 1;
  return {
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
    info: issues.filter((i) => i.severity === "info").length,
    byCode: by,
  };
}

export function sqlLiteral(v: string | number | boolean | null): string {
  if (v === null) return "null";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return `'${v.replace(/'/g, "''")}'`;
}

/** Idempotent SQL upsert for components (alternative to the API import). */
export function componentsSeedSql(records: ComponentRecord[]): string {
  const values = records
    .map((r) => `  (${[r.zoho_item_id, r.component_name, r.component_code, r.product_type, r.is_active].map((x) => sqlLiteral(x as never)).join(", ")})`)
    .join(",\n");
  return `-- Generated by scripts/migrate — component master import (${records.length} rows).
-- Idempotent: re-running updates names/codes/types by Zoho Item ID. It does
-- not change is_active on rows that already exist (admins own that flag).
insert into public.components (zoho_item_id, component_name, component_code, product_type, is_active)
values
${values}
on conflict (zoho_item_id) do update
  set component_name = excluded.component_name,
      component_code = excluded.component_code,
      product_type   = excluded.product_type;
`;
}
