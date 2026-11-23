#!/usr/bin/env tsx
/**
 * APT Production Log — legacy data migration utility.
 *
 *   npm run import:data -- components --master <APT_Production_Master.xlsx> [--items <Item.xlsx>]
 *   npm run import:data -- production --storage <legacy storage folder> [--master <xlsx>]
 *   npm run import:data -- production-list --file <APT_ProdnList.xlsx> [--keep-others]
 *
 * Dry run by default: reads, validates, maps and writes a report — nothing is
 * sent to Supabase. To write, add:  --apply --project-ref <your-project-ref>
 * (the ref must match NEXT_PUBLIC_SUPABASE_URL, as a guard against importing
 * into the wrong project).
 *
 * Safety: original files are only read, never changed; each run first copies
 * them to migration-backups/<timestamp>/ with SHA-256 checksums. Imports are
 * idempotent (components keyed by Zoho Item ID, production rows by a hash of
 * the original row), so re-running never duplicates. Rows that cannot be
 * mapped are listed in the discrepancy report — never silently dropped.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  componentsSeedSql, mapComponents, mapProduction, mapProductionList, parseLogLines, productionListSql, readLegacyCsv, summariseIssues,
  type ComponentLookup, type Discrepancy, type ItemExportRow, type LegacyCsvRow, type LegacyLogLine, type MasterRow,
  type ProductionListRow,
} from "./core";

type Args = Record<string, string | boolean>;
function parseArgs(argv: string[]): { cmd: string; args: Args } {
  const [cmd = "help", ...rest] = argv;
  const args: Args = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = rest[i + 1];
    if (next && !next.startsWith("--")) { args[key] = next; i++; } else args[key] = true;
  }
  return { cmd, args };
}

function loadEnv(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || process.env[m[1]!]) continue;
    process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "").trim();
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

function backup(files: string[], label: string): string {
  const dir = path.resolve("migration-backups", `${stamp}-${label}`);
  mkdirSync(dir, { recursive: true });
  const manifest: { file: string; sha256: string; bytes: number }[] = [];
  files.forEach((f, i) => {
    const target = path.join(dir, `${String(i).padStart(3, "0")}-${path.basename(f)}`);
    copyFileSync(f, target);
    const sha256 = createHash("sha256").update(readFileSync(f)).digest("hex");
    if (createHash("sha256").update(readFileSync(target)).digest("hex") !== sha256) throw new Error(`Backup verification failed for ${f}`);
    manifest.push({ file: path.resolve(f), sha256, bytes: statSync(f).size });
  });
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return dir;
}

function csvCell(v: unknown) {
  const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeReport(label: string, summary: Record<string, unknown>, issues: Discrepancy[], extra: Record<string, string> = {}) {
  const dir = path.resolve("migration-reports", `${stamp}-${label}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(path.join(dir, "discrepancies.json"), JSON.stringify(issues, null, 2));
  writeFileSync(
    path.join(dir, "discrepancies.csv"),
    ["severity,code,source,line,message,raw", ...issues.map((i) => [i.severity, i.code, i.source, i.line, i.message, i.raw].map(csvCell).join(","))].join("\r\n"),
  );
  const s = summariseIssues(issues);
  const md = [
    `# Migration report — ${label}`,
    "",
    `Run: ${new Date().toISOString()}  ·  Mode: **${summary.mode}**`,
    "",
    "## Summary",
    "",
    ...Object.entries(summary).filter(([k]) => k !== "issueCounts").map(([k, v]) => `- **${k}**: ${typeof v === "object" ? JSON.stringify(v) : v}`),
    "",
    `## Discrepancies (${issues.length}: ${s.errors} errors, ${s.warnings} warnings, ${s.info} info)`,
    "",
    "| Severity:code | Count |",
    "|---|---|",
    ...Object.entries(s.byCode).sort().map(([k, v]) => `| ${k} | ${v} |`),
    "",
    "Full list: `discrepancies.csv` / `discrepancies.json`.",
  ].join("\n");
  writeFileSync(path.join(dir, "summary.md"), md);
  for (const [name, content] of Object.entries(extra)) writeFileSync(path.join(dir, name), content);
  return dir;
}

async function readMaster(file: string): Promise<MasterRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Master workbook has no sheets");
  const header = (ws.getRow(1).values as unknown[]).map((v) => String(v ?? "").trim());
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`Master is missing column “${name}” (found: ${header.filter(Boolean).join(", ")})`);
    return i;
  };
  const [ci, cn, cz] = [col("component_id"), col("component_name"), col("ZohoID")];
  const rows: MasterRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    rows.push({ row: r, component_name: row.getCell(cn).value, component_id: row.getCell(ci).value, ZohoID: row.getCell(cz).value });
  }
  return rows;
}

async function readItems(file: string): Promise<ItemExportRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0]!;
  const header = (ws.getRow(1).values as unknown[]).map((v) => String(v ?? "").trim());
  const idx = (n: string) => header.indexOf(n);
  const out: ItemExportRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const id = String(row.getCell(idx("Item ID")).value ?? "").trim();
    if (!id) continue;
    out.push({
      itemId: id,
      productType: idx("Product Type") > 0 ? String(row.getCell(idx("Product Type")).value ?? "") || null : null,
      status: idx("Status") > 0 ? String(row.getCell(idx("Status")).value ?? "") || null : null,
      name: idx("Item Name") > 0 ? String(row.getCell(idx("Item Name")).value ?? "") || null : null,
    });
  }
  return out;
}

function supabaseFromEnv(args: Args): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  let host = "";
  try { host = new URL(url).hostname; } catch { /* handled below */ }
  if (!host || host === "supabase.com") throw new Error("NEXT_PUBLIC_SUPABASE_URL must be the API URL (https://<ref>.supabase.co), not the dashboard address.");
  if (!key) throw new Error("SUPABASE_SECRET_KEY is required for --apply (server-side secret; never commit it).");
  const ref = host.split(".")[0];
  if (args["project-ref"] !== ref) {
    throw new Error("--project-ref does not match the project in NEXT_PUBLIC_SUPABASE_URL. Refusing to write (guard against importing into the wrong project).");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function cmdComponents(args: Args) {
  const master = String(args.master ?? "legacy/streamlit/data/APT_Production_Master.xlsx");
  if (!existsSync(master)) throw new Error(`Master file not found: ${master}`);
  const itemsFile = typeof args.items === "string" ? args.items : null;
  const backupDir = backup([master, ...(itemsFile ? [itemsFile] : [])], "components");

  const { records, issues, blankRows } = mapComponents(await readMaster(master), itemsFile ? await readItems(itemsFile) : null, path.basename(master));
  const apply = args.apply === true;
  const summary: Record<string, unknown> = {
    mode: apply ? "APPLY" : "DRY RUN (nothing written)",
    masterFile: path.resolve(master),
    itemExport: itemsFile ? path.resolve(itemsFile) : "not supplied",
    backup: backupDir,
    sourceRows: records.length + issues.filter((i) => i.severity === "error").length,
    blankRowsSkipped: blankRows,
    componentsReady: records.length,
    active: records.filter((r) => r.is_active).length,
    inactive: records.filter((r) => !r.is_active).length,
    rejected: issues.filter((i) => i.severity === "error").length,
  };

  if (apply) {
    const s = summariseIssues(issues);
    if (s.errors > 0 && args["allow-partial"] !== true) throw new Error(`${s.errors} component rows could not be mapped. Fix them or re-run with --allow-partial. Nothing was written.`);
    const sb = supabaseFromEnv(args);
    const { data: existing, error } = await sb.from("components").select("zoho_item_id").not("zoho_item_id", "is", null);
    if (error) throw new Error(`Could not read components: ${error.message}`);
    const have = new Set((existing ?? []).map((e) => e.zoho_item_id as string));
    const toInsert = records.filter((r) => !have.has(r.zoho_item_id));
    const toUpdate = records.filter((r) => have.has(r.zoho_item_id));
    let inserted = 0, updated = 0;
    const failed: Discrepancy[] = [];
    for (let i = 0; i < toInsert.length; i += 200) {
      const batch = toInsert.slice(i, i + 200);
      const { error: e } = await sb.from("components").insert(batch);
      if (e) failed.push({ severity: "error", source: "supabase", line: null, code: "INSERT_FAILED", message: e.message, raw: batch.map((b) => b.zoho_item_id) });
      else inserted += batch.length;
    }
    for (const r of toUpdate) {
      const { error: e } = await sb.from("components")
        .update({ component_name: r.component_name, component_code: r.component_code, product_type: r.product_type })
        .eq("zoho_item_id", r.zoho_item_id);
      if (e) failed.push({ severity: "error", source: "supabase", line: null, code: "UPDATE_FAILED", message: e.message, raw: r.zoho_item_id });
      else updated++;
    }
    issues.push(...failed);
    Object.assign(summary, { inserted, updatedExisting: updated, writeFailures: failed.length });
  }

  const dir = writeReport("components", summary, issues, { "components_seed.sql": componentsSeedSql(records), "components.json": JSON.stringify(records, null, 2) });
  console.log(`\n${summary.mode}\nComponents ready: ${records.length} (${summary.active} active, ${summary.inactive} inactive)  ·  rejected: ${summary.rejected}`);
  console.log(`Report:  ${dir}\nBackup:  ${backupDir}\n`);
}

function walk(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.toLowerCase().endsWith(ext)).map((f) => path.join(dir, f)).sort();
}

async function cmdProduction(args: Args) {
  const storage = String(args.storage ?? "");
  if (!storage || !existsSync(storage)) throw new Error("--storage <legacy storage folder> is required (the folder containing vim1.csv … and logs/).");
  const csvFiles = walk(storage, ".csv");
  const logFiles = walk(path.join(storage, "logs"), ".log");
  if (csvFiles.length === 0) throw new Error(`No CSV files found in ${storage}`);
  const backupDir = backup([...csvFiles, ...logFiles], "production");

  const issues: Discrepancy[] = [];
  const csvRows: LegacyCsvRow[] = [];
  for (const f of csvFiles) {
    const r = readLegacyCsv(path.basename(f), readFileSync(f, "utf8"));
    csvRows.push(...r.rows);
    issues.push(...r.issues);
  }
  const logLines: LegacyLogLine[] = [];
  for (const f of logFiles) {
    const r = parseLogLines(`logs/${path.basename(f)}`, readFileSync(f, "utf8"));
    logLines.push(...r.lines);
    issues.push(...r.issues);
  }
  if (logFiles.length === 0) issues.push({ severity: "error", source: storage, line: null, code: "NO_LOGS", message: "No logs/*.log files — operator names cannot be recovered" });

  const apply = args.apply === true;
  let components: ComponentLookup[];
  let sb: SupabaseClient | null = null;
  let machineIds = new Map<string, string>();
  if (apply) {
    sb = supabaseFromEnv(args);
    const { data, error } = await sb.from("components").select("id, component_name, component_code");
    if (error) throw new Error(`Could not read components: ${error.message}`);
    components = (data ?? []) as ComponentLookup[];
    const { data: ms } = await sb.from("machines").select("id, machine_code");
    machineIds = new Map((ms ?? []).map((m) => [m.machine_code as string, m.id as string]));
  } else {
    const master = String(args.master ?? "legacy/streamlit/data/APT_Production_Master.xlsx");
    if (!existsSync(master)) throw new Error("Dry run needs --master <xlsx> to map components offline.");
    components = mapComponents(await readMaster(master), null).records.map((r) => ({ id: `zoho:${r.zoho_item_id}`, component_name: r.component_name, component_code: r.component_code }));
  }

  const mapped = mapProduction(csvRows, logLines, components, { includeFlagged: args["include-flagged"] === true });
  issues.push(...mapped.issues);
  const s0 = summariseIssues(issues);
  const summary: Record<string, unknown> = {
    mode: apply ? "APPLY" : "DRY RUN (nothing written)",
    storage: path.resolve(storage),
    backup: backupDir,
    csvFiles: csvFiles.map((f) => path.basename(f)),
    logFiles: logFiles.map((f) => path.basename(f)),
    csvRows: csvRows.length,
    logLines: logLines.length,
    readyToImport: mapped.records.length,
    blockedRows: csvRows.length - mapped.records.length,
    totalQuantityReady: mapped.records.reduce((a, r) => a + r.quantity, 0),
    byMachine: Object.fromEntries(Object.entries(mapped.records.reduce<Record<string, number>>((a, r) => ((a[r.machine_code] = (a[r.machine_code] ?? 0) + 1), a), {}))),
    issueCounts: s0,
  };

  if (apply && sb) {
    if (s0.errors > 0 && args["allow-partial"] !== true) {
      const dir = writeReport("production", { ...summary, mode: "APPLY ABORTED — discrepancies found" }, issues);
      throw new Error(`${s0.errors} rows could not be mapped reliably. Nothing was written. Review ${dir}/summary.md, fix the data or the component master, then re-run (or use --allow-partial to import only the clean rows).`);
    }
    let inserted = 0, alreadyPresent = 0;
    const failures: Discrepancy[] = [];
    for (const rec of mapped.records) {
      const machine_id = machineIds.get(rec.machine_code);
      if (!machine_id) { failures.push({ severity: "error", source: "supabase", line: null, code: "MACHINE_MISSING", message: rec.machine_code }); continue; }
      const { data, error } = await sb.from("production_entries").upsert(
        {
          import_key: rec.import_key, machine_id, component_id: rec.component_id, production_date: rec.production_date,
          hour_slot: rec.hour_slot, quantity: rec.quantity, source: "legacy_import", status: "active",
          legacy_operator_name: rec.legacy_operator_name, legacy_entered_by_name: rec.legacy_entered_by_name,
          legacy_raw: rec.legacy_raw, notes: rec.notes, // shift is derived by the database
        },
        { onConflict: "import_key", ignoreDuplicates: true },
      ).select("id");
      if (error) {
        failures.push({
          severity: "error", source: String(rec.legacy_raw.file), line: Number(rec.legacy_raw.line),
          code: error.code === "23505" ? "SLOT_ALREADY_RECORDED" : "INSERT_FAILED",
          message: error.code === "23505" ? "The database already has a record for this machine/hour/component" : error.message,
        });
      } else if (data && data.length) inserted++;
      else alreadyPresent++;
    }
    issues.push(...failures);
    Object.assign(summary, { inserted, alreadyPresentSkipped: alreadyPresent, writeFailures: failures.length });
  }

  const dir = writeReport("production", summary, issues, { "plan.json": JSON.stringify(mapped.records, null, 2) });
  console.log(`\n${summary.mode}\nCSV rows: ${csvRows.length} · ready: ${mapped.records.length} · blocked: ${summary.blockedRows}`);
  console.log(`Errors: ${s0.errors} · warnings: ${s0.warnings}\nReport:  ${dir}\nBackup:  ${backupDir}\n`);
}

async function readProductionList(file: string): Promise<ProductionListRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Workbook has no sheets");
  const header = (ws.getRow(1).values as unknown[]).map((v) => String(v ?? "").trim().toLowerCase());
  const find = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const nameCol = find("production part name", "part name", "component_name", "component name");
  if (nameCol < 0) throw new Error(`No “Production Part Name” column (found: ${header.filter(Boolean).join(", ")})`);
  const rawCol = find("raw material", "raw_material");
  const rows: ProductionListRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    rows.push({ row: r, name: row.getCell(nameCol).value, rawMaterial: rawCol > 0 ? row.getCell(rawCol).value : null });
  }
  return rows;
}

async function cmdProductionList(args: Args) {
  const file = String(args.file ?? "");
  if (!file || !existsSync(file)) throw new Error("--file <production list .xlsx> is required");
  const backupDir = backup([file], "production-list");
  const keepOthers = args["keep-others"] === true;
  const { records, issues } = mapProductionList(await readProductionList(file), path.basename(file));
  const apply = args.apply === true;
  const summary: Record<string, unknown> = {
    mode: apply ? "APPLY" : "DRY RUN (nothing written)",
    file: path.resolve(file),
    backup: backupDir,
    componentsReady: records.length,
    otherComponents: keepOthers ? "left unchanged (--keep-others)" : "deactivated (hidden from operators, history kept)",
    rejected: issues.filter((i) => i.severity === "error").length,
  };

  if (apply) {
    if (summariseIssues(issues).errors > 0) throw new Error("The list has errors (see the report). Nothing was written.");
    const sb = supabaseFromEnv(args);
    const { data: existing, error } = await sb.from("components").select("id, component_name, is_active");
    if (error) throw new Error(`Could not read components: ${error.message}`);
    const byName = new Map((existing ?? []).map((c) => [String(c.component_name).trim().toLowerCase(), c as { id: string; is_active: boolean }]));
    let inserted = 0, updated = 0, deactivated = 0;
    for (const r of records) {
      const hit = byName.get(r.component_name.toLowerCase());
      const { error: e } = hit
        ? await sb.from("components").update({ component_name: r.component_name, raw_material: r.raw_material, is_active: true }).eq("id", hit.id)
        : await sb.from("components").insert({ component_name: r.component_name, raw_material: r.raw_material, is_active: true });
      if (e) throw new Error(`Writing “${r.component_name}” failed: ${e.message}`);
      if (hit) updated++; else inserted++;
    }
    if (!keepOthers) {
      const keep = new Set(records.map((r) => r.component_name.toLowerCase()));
      for (const [name, c] of byName) {
        if (c.is_active && !keep.has(name)) {
          const { error: e } = await sb.from("components").update({ is_active: false }).eq("id", c.id);
          if (e) throw new Error(`Deactivating a component failed: ${e.message}`);
          deactivated++;
        }
      }
    }
    Object.assign(summary, { inserted, updated, deactivated });
  }

  const dir = writeReport("production-list", summary, issues, {
    "production_components.sql": productionListSql(records, { keepOthers, label: path.basename(file) }),
    "production_components.json": JSON.stringify(records, null, 2),
  });
  console.log(`\n${summary.mode}\nProduction components ready: ${records.length}  ·  rejected: ${summary.rejected}`);
  console.log(`Report:  ${dir}\nBackup:  ${backupDir}\n`);
}

async function main() {
  const { cmd, args } = parseArgs(process.argv.slice(2));
  loadEnv(String(args["env"] ?? ".env.local"));
  if (cmd === "components") return cmdComponents(args);
  if (cmd === "production") return cmdProduction(args);
  if (cmd === "production-list") return cmdProductionList(args);
  console.log(readFileSync(__filename, "utf8").split("*/")[0]);
}

main().catch((e) => {
  console.error(`\n✖ ${(e as Error).message}\n`);
  process.exit(1);
});
