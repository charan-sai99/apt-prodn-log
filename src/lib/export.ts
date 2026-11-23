import type { EntryRow } from "./types";
import type { ProductionSummary } from "./aggregate";

export interface ExportColumn {
  header: string;
  key: string;
  width?: number;
  value: (r: EntryRow) => string | number | null;
}

export const ENTRY_COLUMNS: ExportColumn[] = [
  { header: "Production date", key: "production_date", width: 14, value: (r) => r.production_date },
  { header: "Hour", key: "hour", width: 8, value: (r) => `${String(r.hour_slot).padStart(2, "0")}:00` },
  { header: "Shift", key: "shift", width: 7, value: (r) => r.shift },
  { header: "Machine", key: "machine", width: 9, value: (r) => r.machine_code },
  { header: "Component", key: "component", width: 44, value: (r) => r.component_name },
  { header: "Raw material", key: "raw_material", width: 16, value: (r) => r.raw_material },
  { header: "Part code", key: "component_code", width: 18, value: (r) => r.component_code },
  { header: "Zoho Item ID", key: "zoho", width: 20, value: (r) => r.zoho_item_id },
  { header: "Quantity", key: "quantity", width: 10, value: (r) => r.quantity },
  { header: "Operator", key: "operator", width: 22, value: (r) => r.operator_name },
  { header: "Employee code", key: "operator_code", width: 14, value: (r) => r.operator_code },
  { header: "Entered by", key: "entered_by", width: 22, value: (r) => r.entered_by_name },
  { header: "Status", key: "status", width: 9, value: (r) => r.status },
  { header: "Source", key: "source", width: 13, value: (r) => r.source },
  { header: "Recorded at (UTC)", key: "created_at", width: 22, value: (r) => r.created_at },
  { header: "Record ID", key: "id", width: 38, value: (r) => r.id },
];

/**
 * Neutralise spreadsheet formula injection: a cell starting with = + - @ (or
 * tab/CR) is prefixed with an apostrophe. Plain negative numbers are numbers,
 * not strings, so they are unaffected.
 */
export function sanitizeCell(value: string | number | null | undefined): string | number {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: EntryRow[], columns: ExportColumn[] = ENTRY_COLUMNS): string {
  const lines = [columns.map((c) => csvEscape(c.header)).join(",")];
  for (const r of rows) lines.push(columns.map((c) => csvEscape(sanitizeCell(c.value(r)))).join(","));
  // BOM so Excel opens UTF-8 correctly.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export interface WorkbookInput {
  title: string;
  subtitle: string;
  generatedBy: string;
  generatedAt: string;
  rows: EntryRow[];
  summary: ProductionSummary;
}

const NAVY = "FF0F172A";
const LIGHT = "FFF1F5F9";

export async function buildWorkbook(input: WorkbookInput): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "APT Production Log";
  wb.created = new Date();

  // ---- Summary sheet
  const s = wb.addWorksheet("Summary", { views: [{ showGridLines: false }] });
  s.columns = [{ width: 46 }, { width: 14 }, { width: 12 }];
  s.addRow([sanitizeCell(input.title)]).font = { bold: true, size: 16, color: { argb: NAVY } };
  s.addRow([sanitizeCell(input.subtitle)]).font = { color: { argb: "FF475569" } };
  s.addRow([`Generated ${input.generatedAt} by ${sanitizeCell(input.generatedBy)}`]).font = { italic: true, size: 9, color: { argb: "FF64748B" } };
  s.addRow([]);
  s.addRow(["Total quantity", input.summary.totalQuantity]).font = { bold: true };
  s.addRow(["Hourly entries", input.summary.entryCount]);
  s.addRow(["Operators", input.summary.activeOperators]);

  const section = (title: string, buckets: { label: string; quantity: number; entries: number }[]) => {
    s.addRow([]);
    const h = s.addRow([title, "Quantity", "Entries"]);
    h.font = { bold: true, color: { argb: "FFFFFFFF" } };
    h.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }));
    for (const b of buckets) s.addRow([sanitizeCell(b.label), b.quantity, b.entries]);
  };
  section("By machine", input.summary.byMachine);
  section("By shift", input.summary.byShift.filter((b) => b.entries > 0));
  section("By operator", input.summary.byOperator);
  section("By component", input.summary.byComponent);
  section("By raw material", input.summary.byRawMaterial);
  if (input.summary.byDate.length > 1) section("By date", input.summary.byDate);
  s.getColumn(2).numFmt = "#,##0";

  // ---- Detail sheet
  const d = wb.addWorksheet("Records", { views: [{ state: "frozen", ySplit: 1 }] });
  d.columns = ENTRY_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 14 }));
  const header = d.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }));
  input.rows.forEach((r, i) => {
    const row = d.addRow(Object.fromEntries(ENTRY_COLUMNS.map((c) => [c.key, sanitizeCell(c.value(r))])));
    if (i % 2 === 1) row.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } }));
  });
  d.getColumn("quantity").numFmt = "#,##0";
  d.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ENTRY_COLUMNS.length } };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
