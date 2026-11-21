import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildWorkbook, sanitizeCell, toCsv } from "@/lib/export";
import { summarize } from "@/lib/aggregate";
import { row } from "./fixtures";

describe("CSV export", () => {
  it("escapes commas, quotes and new lines and starts with a BOM", () => {
    const csv = toCsv([row({ component_name: 'PART, "A"\nB', quantity: 42 })]);
    expect(csv.startsWith("﻿Production date,")).toBe(true);
    expect(csv).toContain('"PART, ""A""\nB"');
    expect(csv).toContain(",42,");
  });
  it("neutralises spreadsheet formulas", () => {
    expect(sanitizeCell("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(sanitizeCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(sanitizeCell(-5)).toBe(-5);
    expect(sanitizeCell(null)).toBe("");
    expect(toCsv([row({ component_name: "=1+1" })])).toContain("'=1+1");
  });
});

describe("Excel export", () => {
  it("builds a workbook with a summary and the records", async () => {
    const rows = [row({ quantity: 10 }), row({ quantity: 32, machine_code: "HIM" }), row({ quantity: 5, component_name: "+cmd" })];
    const buf = await buildWorkbook({
      title: "APT — Daily production report",
      subtitle: "2026-11-20 to 2026-11-20",
      generatedBy: "Sup One",
      generatedAt: "20 Nov 2026, 18:00",
      rows,
      summary: summarize(rows),
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Summary", "Records"]);
    const summary = wb.getWorksheet("Summary")!;
    expect(summary.getCell("A1").value).toBe("APT — Daily production report");
    expect(summary.getCell("B5").value).toBe(47);
    const rec = wb.getWorksheet("Records")!;
    expect(rec.rowCount).toBe(4);
    expect(rec.getRow(1).getCell(8).value).toBe("Quantity");
    expect(rec.getRow(3).getCell(8).value).toBe(32);
    expect(rec.getRow(4).getCell(5).value).toBe("'+cmd");
  });
});
