import { describe, expect, it } from "vitest";
import { avatarColor, avatarUrl, initials, pinErrorMessage, PIN_RE } from "@/lib/pin-login";
import { codeFromName, createUserSchema, pinSchema } from "@/lib/validation";

describe("PIN rules", () => {
  it("accepts exactly four digits", () => {
    for (const ok of ["0000", "1957", "4821"]) expect(PIN_RE.test(ok) && pinSchema.safeParse(ok).success).toBe(true);
    for (const bad of ["123", "12345", "12a4", " 123", "１２３４"]) expect(pinSchema.safeParse(bad).success).toBe(false);
  });
  it("explains every refusal in plain words", () => {
    expect(pinErrorMessage({ ok: false, reason: "wrong_pin", remaining: 1 })).toMatch(/1 try left/);
    expect(pinErrorMessage({ ok: false, reason: "wrong_pin", remaining: 3 })).toMatch(/3 tries left/);
    expect(pinErrorMessage({ ok: false, reason: "locked", locked_until: "2026-11-25T06:30:00Z" })).toMatch(/12:00/);
    expect(pinErrorMessage({ ok: false, reason: "locked_admin" })).toMatch(/administrator/);
    expect(pinErrorMessage({ ok: false, reason: "no_pin" })).toMatch(/No PIN/);
  });
});

describe("avatars", () => {
  it("makes initials and a stable colour", () => {
    expect(initials("Vishnu Sai Jagadesan")).toBe("VJ");
    expect(initials("saroj")).toBe("SA");
    expect(avatarColor("abc")).toBe(avatarColor("abc"));
    expect(avatarUrl("x", null)).toBeNull();
    expect(avatarUrl("x", 5)).toBe("/api/avatar/x?v=5");
  });
});

describe("adding people", () => {
  it("makes employee codes from names", () => {
    expect(codeFromName("Vishnu Sai Jagadesan")).toBe("VISHNU");
    expect(codeFromName("Neeraj")).toBe("NEERAJ");
    expect(codeFromName("A")).toBe("EMPA");
  });
  it("needs email and password only for administrators", () => {
    expect(createUserSchema.safeParse({ displayName: "Saroj", role: "operator" }).success).toBe(true);
    expect(createUserSchema.safeParse({ displayName: "Saroj", role: "operator", pin: "12" }).success).toBe(false);
    expect(createUserSchema.safeParse({ displayName: "Boss", role: "admin" }).success).toBe(false);
    expect(createUserSchema.safeParse({ displayName: "Boss", role: "admin", email: "a@b.co", password: "longenough" }).success).toBe(true);
  });
});
