import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildProductionListWorkbook, diffProductionList, mapProductionList, readProductionListWorkbook, type CurrentComponent,
} from "@/lib/production-list";

const current: CurrentComponent[] = [
  { id: "1", component_name: "STAR LEAF 021", raw_material: "PC ORANGE", is_active: true },
  { id: "2", component_name: "N45 CAP", raw_material: "PC GREY", is_active: true },
  { id: "3", component_name: "Spacer 2mm", raw_material: "NYLON 30 WHITE", is_active: true },
  { id: "4", component_name: "PUSHER CAP", raw_material: "NYLON 6 WHITE", is_active: false },
  { id: "5", component_name: "OLD ASSEMBLY", raw_material: null, is_active: true },
  { id: "6", component_name: "ALREADY HIDDEN", raw_material: null, is_active: false },
];
const list = [
  { component_name: "STAR LEAF 021", raw_material: "PC ORANGE" },
  { component_name: "N45 CAP", raw_material: "PC BLACK" },
  { component_name: "SPACER 2MM", raw_material: "NYLON 30 WHITE" },
  { component_name: "PUSHER CAP", raw_material: "NYLON 6 WHITE" },
  { component_name: "NEW BUSH", raw_material: "PC WHITE" },
];

describe("upload preview (diff)", () => {
  const d = diffProductionList(list, current);
  it("classifies every part", () => {
    expect(d.added.map((c) => c.name)).toEqual(["NEW BUSH"]);
    expect(d.updated.map((c) => [c.name, c.previousName, c.previousRawMaterial, c.rawMaterial])).toEqual([
      ["N45 CAP", "N45 CAP", "PC GREY", "PC BLACK"],
      ["SPACER 2MM", "Spacer 2mm", "NYLON 30 WHITE", "NYLON 30 WHITE"],
    ]);
    expect(d.reactivated.map((c) => c.name)).toEqual(["PUSHER CAP"]);
    expect(d.hidden.map((c) => c.name)).toEqual(["OLD ASSEMBLY"]);
    expect(d.unchanged).toBe(1);
  });
  it("hides nothing when 'hide others' is off", () => {
    expect(diffProductionList(list, current, false).hidden).toEqual([]);
  });
});

describe("Excel round trip", () => {
  it("downloads the list in the same format it uploads", async () => {
    const buf = await buildProductionListWorkbook(list);
    const parsed = mapProductionList(await readProductionListWorkbook(buf));
    expect(parsed.records).toEqual(list);
    expect(parsed.issues).toEqual([]);
  });
  it("reads the real APT_ProdnList.xlsx", async () => {
    const rows = await readProductionListWorkbook(readFileSync(path.resolve("tests/fixtures/APT_ProdnList.xlsx")));
    const parsed = mapProductionList(rows);
    expect(parsed.records).toHaveLength(24);
    expect(parsed.records[0]).toEqual({ component_name: "STAR LEAF 021", raw_material: "PC ORANGE" });
  });
  it("explains files it cannot use", async () => {
    await expect(readProductionListWorkbook(Buffer.from("not a workbook"))).rejects.toThrow(/could not be read/);
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("x").addRow(["Name", "Qty"]);
    const wrong = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    await expect(readProductionListWorkbook(wrong)).rejects.toThrow(/Production Part Name/);
  });
});
