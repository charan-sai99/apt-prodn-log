import { describe, expect, it } from "vitest";
import { factoryNow, formatHourSlot, hoursOfShift, isValidIsoDate, operatorAllowedDates, periodRange, selectableHours, shiftForHour } from "@/lib/time";
import type { Shift } from "@/lib/types";

const shifts: Shift[] = [
  { code: "A", name: "A", start_hour: 6, end_hour: 14, sort_order: 1, is_active: true },
  { code: "B", name: "B", start_hour: 14, end_hour: 22, sort_order: 2, is_active: true },
  { code: "C", name: "C", start_hour: 22, end_hour: 6, sort_order: 3, is_active: true },
];

describe("factory time zone (Asia/Kolkata)", () => {
  it("converts UTC to IST, including across midnight", () => {
    expect(factoryNow("Asia/Kolkata", new Date("2026-11-20T18:45:00Z"))).toMatchObject({ date: "2026-11-21", hour: 0, minute: 15 });
    expect(factoryNow("Asia/Kolkata", new Date("2026-11-20T03:29:00Z"))).toMatchObject({ date: "2026-11-20", hour: 8 });
  });
  it("only offers hours up to the current one today and none in the future", () => {
    const now = new Date("2026-11-20T05:10:00Z"); // 10:40 IST
    expect(selectableHours("2026-11-20", "Asia/Kolkata", now)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(selectableHours("2026-11-19", "Asia/Kolkata", now)).toHaveLength(24);
    expect(selectableHours("2026-11-21", "Asia/Kolkata", now)).toEqual([]);
  });
  it("lists today plus back-dated days", () => {
    expect(operatorAllowedDates(1, "Asia/Kolkata", new Date("2026-11-20T20:00:00Z"))).toEqual(["2026-11-21", "2026-11-20"]);
  });
});

describe("shifts", () => {
  it("maps hours to shifts, wrapping midnight like the database", () => {
    expect(shiftForHour(shifts, 6)).toBe("A");
    expect(shiftForHour(shifts, 13)).toBe("A");
    expect(shiftForHour(shifts, 14)).toBe("B");
    expect(shiftForHour(shifts, 23)).toBe("C");
    expect(shiftForHour(shifts, 0)).toBe("C");
    expect(shiftForHour(shifts, 5)).toBe("C");
  });
  it("ignores inactive shifts", () => {
    expect(shiftForHour([{ ...shifts[0]!, is_active: false }], 8)).toBeNull();
  });
  it("lists the hours of a wrapping shift", () => {
    expect(hoursOfShift(shifts[2]!)).toEqual([22, 23, 0, 1, 2, 3, 4, 5]);
  });
});

describe("dates & periods", () => {
  it("validates ISO dates strictly", () => {
    expect(isValidIsoDate("2026-11-20")).toBe(true);
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    expect(isValidIsoDate("2026-1-2")).toBe(false);
  });
  it("computes report periods (weeks start Monday)", () => {
    expect(periodRange("daily", "2026-11-20")).toEqual({ from: "2026-11-20", to: "2026-11-20" });
    expect(periodRange("weekly", "2026-11-20")).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    expect(periodRange("monthly", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
  it("formats hour slots", () => {
    expect(formatHourSlot(8)).toBe("08:00–09:00");
    expect(formatHourSlot(23)).toBe("23:00–00:00");
  });
});
