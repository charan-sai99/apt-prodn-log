/**
 * Production component list (moulded child parts + raw material), maintained
 * as an Excel sheet and independent of Zoho. Shared by the admin upload in the
 * app and by the command-line importer, so both read the sheet the same way.
 *
 * Expected sheet (first worksheet, header in row 1):
 *   "Production Part Name" (required)  ·  "RAW MATERIAL" (optional)
 * Other columns (Item ID, SKU, Status …) are ignored.
 */

export interface ListIssue {
  severity: "error" | "warning" | "info";
  source: string;
  line: number | null;
  code: string;
  message: string;
  raw?: unknown;
}

export interface ProductionListRow {
  row: number;
  name: unknown;
  rawMaterial: unknown;
}

export interface ProductionComponent {
  component_name: string;
  raw_material: string | null;
}

export const MAX_LIST_ROWS = 2000;
export const NAME_HEADERS = ["production part name", "part name", "component_name", "component name"];
export const MATERIAL_HEADERS = ["raw material", "raw_material"];

export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in o) return String(o.text ?? "");
    if ("result" in o) return String(o.result ?? "");
    if (v instanceof Date) return v.toISOString();
  }
  return String(v);
}

const clean = (v: unknown) => cellText(v).replace(/\s+/g, " ").trim();
export const nameKey = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();

export function mapProductionList(rows: ProductionListRow[], source = "production list") {
  const issues: ListIssue[] = [];
  const records: ProductionComponent[] = [];
  const seen = new Map<string, number>();
  let blank = 0;
  for (const r of rows) {
    const name = clean(r.name);
    if (!name) {
      blank++;
      continue;
    }
    if (name.length > 200) {
      issues.push({ severity: "error", source, line: r.row, code: "NAME_TOO_LONG", message: `“${name.slice(0, 40)}…” is longer than 200 characters` });
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      issues.push({ severity: "error", source, line: r.row, code: "DUPLICATE_NAME", message: `“${name}” is also on row ${seen.get(key)}` });
      continue;
    }
    seen.set(key, r.row);
    const raw = clean(r.rawMaterial);
    if (raw.length > 80) {
      issues.push({ severity: "error", source, line: r.row, code: "RAW_MATERIAL_TOO_LONG", message: `Raw material for “${name}” is longer than 80 characters` });
      continue;
    }
    if (!raw) issues.push({ severity: "warning", source, line: r.row, code: "MISSING_RAW_MATERIAL", message: `“${name}” has no raw material` });
    records.push({ component_name: name, raw_material: raw || null });
  }
  if (blank) {
    issues.push({ severity: "info", source, line: null, code: "BLANK_ROWS_SKIPPED", message: `${blank} row(s) without a part name were skipped` });
  }
  return { records, issues };
}

/** Read the first worksheet of an .xlsx file into list rows. Throws a user-readable Error. */
export async function readProductionListWorkbook(data: ArrayBuffer | Buffer): Promise<ProductionListRow[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data as ArrayBuffer);
  } catch {
    throw new Error("This file could not be read as an Excel workbook (.xlsx).");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("The workbook has no sheets.");
  const header = (ws.getRow(1).values as unknown[]).map((v) => cellText(v).trim().toLowerCase());
  const nameCol = header.findIndex((h) => NAME_HEADERS.includes(h));
  if (nameCol < 0) {
    throw new Error(`No “Production Part Name” column in row 1 (found: ${header.filter(Boolean).join(", ") || "nothing"}).`);
  }
  const rawCol = header.findIndex((h) => MATERIAL_HEADERS.includes(h));
  if (ws.rowCount - 1 > MAX_LIST_ROWS) throw new Error(`The sheet has more than ${MAX_LIST_ROWS} rows.`);
  const rows: ProductionListRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    rows.push({ row: r, name: row.getCell(nameCol).value, rawMaterial: rawCol > 0 ? row.getCell(rawCol).value : null });
  }
  return rows;
}

export interface CurrentComponent {
  id: string;
  component_name: string;
  raw_material: string | null;
  is_active: boolean;
}

export interface ListChange {
  name: string;
  rawMaterial: string | null;
  previousName?: string;
  previousRawMaterial?: string | null;
}

export interface ListDiff {
  added: ListChange[];
  updated: ListChange[];
  reactivated: ListChange[];
  hidden: ListChange[];
  unchanged: number;
}

/** What applying the list would change. Mirrors public.apply_production_list(). */
export function diffProductionList(records: ProductionComponent[], current: CurrentComponent[], hideOthers = true): ListDiff {
  const byKey = new Map(current.map((c) => [nameKey(c.component_name), c]));
  const listKeys = new Set(records.map((r) => nameKey(r.component_name)));
  const diff: ListDiff = { added: [], updated: [], reactivated: [], hidden: [], unchanged: 0 };
  for (const r of records) {
    const c = byKey.get(nameKey(r.component_name));
    const change: ListChange = { name: r.component_name, rawMaterial: r.raw_material };
    if (!c) diff.added.push(change);
    else if (!c.is_active) diff.reactivated.push({ ...change, previousRawMaterial: c.raw_material });
    else if (c.component_name !== r.component_name || (c.raw_material ?? null) !== r.raw_material) {
      diff.updated.push({ ...change, previousName: c.component_name, previousRawMaterial: c.raw_material });
    } else diff.unchanged++;
  }
  if (hideOthers) {
    for (const c of current) {
      if (c.is_active && !listKeys.has(nameKey(c.component_name))) diff.hidden.push({ name: c.component_name, rawMaterial: c.raw_material });
    }
  }
  diff.hidden.sort((a, b) => a.name.localeCompare(b.name));
  return diff;
}

/** The current active list as an .xlsx in the same format, ready to edit and re-upload. */
export async function buildProductionListWorkbook(components: { component_name: string; raw_material: string | null }[]): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "APT Production Log";
  const ws = wb.addWorksheet("Production list", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Production Part Name", key: "name", width: 40 },
    { header: "RAW MATERIAL", key: "raw", width: 20 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } }));
  for (const c of components) {
    // Prefix formula-like text so Excel never evaluates it.
    const safe = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
    ws.addRow({ name: safe(c.component_name), raw: c.raw_material ? safe(c.raw_material) : "" });
  }
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
