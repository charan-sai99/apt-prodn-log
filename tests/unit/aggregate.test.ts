import { describe, expect, it } from "vitest";
import { summarize } from "@/lib/aggregate";
import { row } from "./fixtures";

describe("dashboard aggregation", () => {
  const rows = [
    row({ machine_code: "VIM1", quantity: 100, hour_slot: 8, operator_id: "a", operator_name: "A", component_id: "c1", component_name: "P1" }),
    row({ machine_code: "VIM1", quantity: 50, hour_slot: 9, operator_id: "a", operator_name: "A", component_id: "c2", component_name: "P2" }),
    row({ machine_code: "HIM", quantity: 200, hour_slot: 9, operator_id: "b", operator_name: "B", component_id: "c1", component_name: "P1", shift: "B" }),
    row({ machine_code: "VIM2", quantity: 999, status: "voided", operator_id: "c" }),
  ];
  const machineOrder = ["VIM1", "VIM2", "VIM3", "VIM4", "HIM"].map((code) => ({ code, name: code }));
  const s = summarize(rows, { machineOrder, dates: ["2026-11-19", "2026-11-20"] });

  it("totals active records only", () => {
    expect(s.totalQuantity).toBe(350);
    expect(s.entryCount).toBe(3);
    expect(s.activeOperators).toBe(2);
  });
  it("keeps all five machines in order, with zeros", () => {
    expect(s.byMachine.map((b) => [b.key, b.quantity])).toEqual([["VIM1", 150], ["VIM2", 0], ["VIM3", 0], ["VIM4", 0], ["HIM", 200]]);
  });
  it("groups by component, operator, hour, shift and date", () => {
    expect(s.byComponent[0]).toMatchObject({ label: "P1", quantity: 300, entries: 2 });
    expect(s.byOperator.map((b) => b.label)).toEqual(["B", "A"]);
    expect(s.byHour).toHaveLength(24);
    expect(s.byHour[9]).toMatchObject({ quantity: 250, entries: 2 });
    expect(s.byShift.map((b) => [b.key, b.quantity])).toEqual([["A", 150], ["B", 200]]);
    expect(s.byDate.map((b) => [b.key, b.quantity])).toEqual([["2026-11-19", 0], ["2026-11-20", 350]]);
  });
  it("handles legacy rows without an operator account", () => {
    const t = summarize([row({ operator_id: null, operator_name: "Ramesh (legacy)" })]);
    expect(t.byOperator[0]!.label).toBe("Ramesh (legacy)");
    expect(t.activeOperators).toBe(1);
  });
});
