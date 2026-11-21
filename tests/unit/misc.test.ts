import { describe, expect, it } from "vitest";
import { friendlyDbError, errorCode } from "@/lib/errors";
import { isOperatorLoginEmail, toLoginEmail } from "@/lib/login-id";
import { safeNextPath } from "@/lib/safe-redirect";
import { isValidSupabaseUrl } from "@/lib/env";
import { parseRecordFilters } from "@/lib/filters";
import { navFor } from "@/components/nav-config";

describe("login identifiers", () => {
  it("maps employee codes to the internal login domain", () => {
    expect(toLoginEmail(" OP014 ", "operators.apt.internal")).toBe("op014@operators.apt.internal");
    expect(toLoginEmail("Sup@APT.in")).toBe("sup@apt.in");
    expect(toLoginEmail("bad code!")).toBeNull();
    expect(toLoginEmail("")).toBeNull();
    expect(isOperatorLoginEmail("op1@operators.apt.internal")).toBe(true);
    expect(isOperatorLoginEmail("boss@apt.in")).toBe(false);
  });
});

describe("error mapping", () => {
  it("turns RPC codes into operator-friendly messages", () => {
    expect(friendlyDbError({ message: "DUPLICATE_SLOT: this machine already has…" })).toMatch(/Request correction/);
    expect(friendlyDbError({ message: "INVALID_QUANTITY: quantity must be a whole number between 1 and 100000" })).toMatch(/between 1 and 100000/);
    expect(friendlyDbError({ message: "some internal pg detail", code: "XX000" })).toBe("Something went wrong. Please try again.");
    expect(errorCode({ message: "NOT_ASSIGNED: x" })).toBe("NOT_ASSIGNED");
  });
});

describe("security helpers", () => {
  it("only allows same-site redirects", () => {
    expect(safeNextPath("/records?machine=VIM1")).toBe("/records?machine=VIM1");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("/\\evil")).toBe("/");
  });
  it("rejects the Supabase dashboard address as the API URL", () => {
    expect(isValidSupabaseUrl("https://abcd.supabase.co")).toBe(true);
    expect(isValidSupabaseUrl("https://supabase.com/dashboard/project/abcd")).toBe(false);
    expect(isValidSupabaseUrl("not a url")).toBe(false);
  });
  it("drops invalid filter values instead of passing them to queries", () => {
    const f = parseRecordFilters({ machine: "vim1", operator: "not-a-uuid", from: "2026-11-30", to: "2026-11-01", shift: "a;drop" }, { from: "2026-11-20", to: "2026-11-20" });
    expect(f.machine).toBe("VIM1");
    expect(f.operator).toBeUndefined();
    expect(f.shift).toBeUndefined();
    expect([f.from, f.to]).toEqual(["2026-11-01", "2026-11-30"]);
  });
});

describe("role-based navigation", () => {
  it("never shows admin or supervisor pages to operators", () => {
    const hrefs = navFor("operator").map((n) => n.href);
    expect(hrefs).toEqual(["/entry", "/history", "/my-corrections"]);
    expect(navFor("supervisor").some((n) => n.href.startsWith("/admin"))).toBe(false);
    expect(navFor("admin").some((n) => n.href === "/admin/users")).toBe(true);
  });
});
