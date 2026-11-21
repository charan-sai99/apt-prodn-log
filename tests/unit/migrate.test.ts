import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { componentsSeedSql, importKey, mapComponents, mapProduction, parseCsv, parseLogLines, readLegacyCsv, type ComponentLookup } from "../../scripts/migrate/core";

describe("component master mapping", () => {
  const master = [
    { row: 2, component_name: "N45 SPEEDO POINTER ASSEMBLY", component_id: "COM-SPA-00018", ZohoID: "74630000000006013" },
    { row: 3, component_name: "Freight", component_id: null, ZohoID: "74630000000099999" },
    { row: 4, component_name: "  HDPE INNER   CAP SMALL ", component_id: "", ZohoID: "74630000000011111" },
    { row: 5, component_name: "Prototype A", component_id: "CAG-MND-00001", ZohoID: "74630000000022222" },
    { row: 6, component_name: "Prototype B", component_id: "CAG-MND-00001", ZohoID: "74630000000033333" },
    { row: 7, component_name: "No zoho", component_id: "X", ZohoID: null },
    { row: 8, component_name: "Dup zoho", component_id: "Y", ZohoID: "74630000000006013" },
    { row: 9, component_name: null, component_id: null, ZohoID: null },
  ];
  const items = [
    { itemId: "74630000000006013", productType: "goods", status: "Active", name: "N45 SPEEDO POINTER ASSEMBLY" },
    { itemId: "74630000000099999", productType: "service", status: "Active", name: "Freight" },
  ];
  const r = mapComponents(master, items);

  it("keys components on Zoho Item ID and normalises whitespace in names", () => {
    expect(r.records.map((x) => x.component_name)).toEqual(["N45 SPEEDO POINTER ASSEMBLY", "Freight", "HDPE INNER CAP SMALL", "Prototype A", "Prototype B"]);
    expect(r.blankRows).toBe(1);
  });
  it("imports Zoho service items as inactive instead of dropping them", () => {
    expect(r.records.find((x) => x.component_name === "Freight")!.is_active).toBe(false);
    expect(r.issues.some((i) => i.code === "SERVICE_ITEM_INACTIVE")).toBe(true);
  });
  it("reports rows it cannot key and shared part codes", () => {
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain("MISSING_ZOHO_ID");
    expect(codes).toContain("DUPLICATE_ZOHO_ID");
    expect(codes.filter((c) => c === "SHARED_PART_CODE")).toHaveLength(2);
  });
  it("produces an idempotent, quote-safe SQL seed", () => {
    const sql = componentsSeedSql([{ zoho_item_id: "1", component_name: "O'Ring", component_code: null, product_type: null, is_active: true, description: null }]);
    expect(sql).toContain("'O''Ring'");
    expect(sql).toContain("on conflict (zoho_item_id) do update");
    expect(sql).not.toMatch(/is_active\s*=\s*excluded/);
  });
});

describe("legacy production mapping", () => {
  const comps: ComponentLookup[] = [
    { id: "c1", component_name: "N45 SPEEDO POINTER ASSEMBLY", component_code: "COM-SPA-00018" },
    { id: "c2", component_name: "TVS STAR DIAL SPACER", component_code: "COM-SOP-00006" },
  ];
  it("parses pandas-style CSV with quoted commas", () => {
    expect(parseCsv('a,b\n"x, y",2\n')).toEqual([["a", "b"], ["x, y", "2"]]);
  });
  it("rejects files with the wrong header", () => {
    expect(readLegacyCsv("vim1.csv", "time,qty\n1,2\n").issues[0]!.code).toBe("BAD_HEADER");
  });
  it("maps rows, recovers operator names from logs and keeps import keys stable", () => {
    const csv = readLegacyCsv("vim1.csv", "log_datetime,component_name,component_id,quantity\n2026-01-05 08:00,N45 SPEEDO POINTER ASSEMBLY,COM-SPA-00018,240\n");
    const logs = parseLogLines("logs/vim1.log", "[2026-01-05 09:02:11] EnteredBy:Suresh | Operator:Ravi | ProdTime:2026-01-05 08:00 | Component:COM-SPA-00018 | Qty:240 | Machine:vim1 | File:vim1.csv\n");
    const out = mapProduction(csv.rows, logs.lines, comps);
    expect(out.issues).toEqual([]);
    expect(out.records[0]).toMatchObject({ machine_code: "VIM1", component_id: "c1", production_date: "2026-01-05", hour_slot: 8, quantity: 240, legacy_operator_name: "Ravi", legacy_entered_by_name: "Suresh" });
    expect(out.records[0]!.import_key).toBe(importKey("VIM1", csv.rows[0]!.values, 1));
  });
  it("blocks invalid values instead of guessing", () => {
    const csv = readLegacyCsv("vim9.csv", "log_datetime,component_name,component_id,quantity\n2026-01-05 08:00,X,Y,1\n");
    expect(mapProduction(csv.rows, [], comps).issues[0]!.code).toBe("UNKNOWN_MACHINE");
    const bad = readLegacyCsv("vim1.csv", "log_datetime,component_name,component_id,quantity\n05/01/2026 8:00,X,Y,1\n2026-01-05 08:00,X,Y,0\n");
    expect(mapProduction(bad.rows, [], comps).issues.map((i) => i.code)).toEqual(["BAD_DATETIME", "BAD_QUANTITY"]);
  });

  it("end-to-end dry run on a storage folder written by the legacy app's own code", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "legacy-"));
    const storage = path.join(tmp, "storage");
    execFileSync("python3", [path.resolve("tests/fixtures/make_legacy_storage.py"), storage]);
    const master = path.resolve(tmp, "master.xlsx");
    execFileSync("cp", [path.resolve("legacy/streamlit/data/APT_Production_Master.xlsx"), master]);
    const out = execFileSync("npx", ["tsx", path.resolve("scripts/migrate/index.ts"), "production", "--storage", storage, "--master", master, "--env", "/nonexistent"], { cwd: tmp, encoding: "utf8" });
    expect(out).toContain("DRY RUN");
    expect(out).toContain("CSV rows: 10 · ready: 4 · blocked: 6");
    const reportDir = /Report:\s+(\S+)/.exec(out)![1]!;
    const issues = JSON.parse(readFileSync(path.join(reportDir, "discrepancies.json"), "utf8")) as { code: string }[];
    expect(issues.map((i) => i.code).sort()).toEqual(["CONFLICTING_ROW", "CONFLICTING_ROW", "DUPLICATE_ROW", "LOOKS_LIKE_TEST_DATA", "NO_LOG_MATCH", "UNKNOWN_COMPONENT"]);
    // Originals untouched; backup written.
    const backup = /Backup:\s+(\S+)/.exec(out)![1]!;
    const manifest = JSON.parse(readFileSync(path.join(backup, "manifest.json"), "utf8")) as unknown[];
    expect(manifest.length).toBe(7);
  }, 60000);
});
