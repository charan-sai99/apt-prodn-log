import { describe, expect, it } from "vitest";
import { correctionSchema, createUserSchema, entrySchema, quantitySchema, reviewSchema, machineSchema } from "@/lib/validation";

const base = {
  machineId: "7b0c2f1e-1d2a-4c3b-9e8f-0a1b2c3d4e5f",
  componentId: "8c1d3a2f-2e3b-4d4c-8f9a-1b2c3d4e5f60",
  productionDate: "2026-11-20",
  hourSlot: 8,
  quantity: "120",
  clientRequestId: "9d2e4b3a-3f4c-4e5d-9a0b-2c3d4e5f6071",
};

describe("quantity validation", () => {
  it.each([["1", 1], [" 250 ", 250], [999, 999], ["100000", 100000]])("accepts %s", (input, out) => {
    expect(quantitySchema.parse(input)).toBe(out);
  });
  it.each(["0", "-3", "1.5", "1e3", "abc", "", " ", "12 3", "+5"])("rejects %j", (input) => {
    expect(quantitySchema.safeParse(input).success).toBe(false);
  });
  it("rejects values above the hard ceiling", () => {
    expect(quantitySchema.safeParse("1000001").success).toBe(false);
  });
});

describe("entry schema", () => {
  it("parses a valid hourly entry", () => {
    const r = entrySchema.parse(base);
    expect(r.quantity).toBe(120);
    expect(r.hourSlot).toBe(8);
  });
  it("requires a component", () => {
    const r = entrySchema.safeParse({ ...base, componentId: "" });
    expect(r.success).toBe(false);
  });
  it("rejects invalid dates and hours", () => {
    expect(entrySchema.safeParse({ ...base, productionDate: "2026-02-30" }).success).toBe(false);
    expect(entrySchema.safeParse({ ...base, productionDate: "20-11-2026" }).success).toBe(false);
    expect(entrySchema.safeParse({ ...base, hourSlot: 24 }).success).toBe(false);
    expect(entrySchema.safeParse({ ...base, hourSlot: -1 }).success).toBe(false);
  });
  it("requires an idempotency key", () => {
    expect(entrySchema.safeParse({ ...base, clientRequestId: "x" }).success).toBe(false);
  });
});

describe("correction & review schemas", () => {
  const entryId = base.machineId;
  it("needs a new value for a change", () => {
    expect(correctionSchema.safeParse({ entryId, requestType: "change", reason: "typo", proposedQuantity: "" }).success).toBe(false);
    expect(correctionSchema.safeParse({ entryId, requestType: "change", reason: "typo", proposedQuantity: "90" }).success).toBe(true);
  });
  it("allows a void with just a reason", () => {
    expect(correctionSchema.safeParse({ entryId, requestType: "void", reason: "wrong machine" }).success).toBe(true);
    expect(correctionSchema.safeParse({ entryId, requestType: "void", reason: "x" }).success).toBe(false);
  });
  it("requires a note to reject", () => {
    expect(reviewSchema.safeParse({ requestId: entryId, approve: false }).success).toBe(false);
    expect(reviewSchema.safeParse({ requestId: entryId, approve: false, note: "not a typo" }).success).toBe(true);
    expect(reviewSchema.safeParse({ requestId: entryId, approve: true }).success).toBe(true);
  });
});

describe("admin schemas", () => {
  it("requires email for supervisors and admins only", () => {
    const u = { displayName: "Ravi Kumar", employeeCode: "OP14", password: "longenough" };
    expect(createUserSchema.safeParse({ ...u, role: "operator", email: "" }).success).toBe(true);
    expect(createUserSchema.safeParse({ ...u, role: "supervisor", email: "" }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...u, role: "admin", email: "a@b.co" }).success).toBe(true);
  });
  it("rejects roles that do not exist (no browser-supplied role escalation)", () => {
    expect(createUserSchema.safeParse({ displayName: "X Y", employeeCode: "OP1", password: "longenough", role: "superadmin" }).success).toBe(false);
  });
  it("normalises machine codes", () => {
    expect(machineSchema.parse({ machineCode: "vim5", machineName: "VIM 5", machineType: "vertical_injection" }).machineCode).toBe("VIM5");
  });
});
