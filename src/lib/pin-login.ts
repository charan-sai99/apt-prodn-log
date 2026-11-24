/** Shared, framework-free helpers for photo + PIN sign-in. */

export const PIN_RE = /^[0-9]{4}$/;

export interface RosterEntry {
  id: string;
  display_name: string;
  designation: string | null;
  role: "operator" | "supervisor";
  display_order: number;
  photo_version: number | null;
  has_pin: boolean;
  machines: string[];
}

export type PinResult =
  | { ok: true; role: string }
  | { ok: false; reason: "wrong_pin"; remaining: number }
  | { ok: false; reason: "locked"; locked_until: string }
  | { ok: false; reason: "locked_admin" | "no_pin" | "unavailable" };

export function pinErrorMessage(r: Exclude<PinResult, { ok: true }>, timezone = "Asia/Kolkata"): string {
  switch (r.reason) {
    case "wrong_pin":
      return `Wrong PIN. ${r.remaining} ${r.remaining === 1 ? "try" : "tries"} left before a 15-minute lock.`;
    case "locked": {
      const t = new Date(r.locked_until).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: timezone });
      return `Too many wrong PINs. Try again after ${t}.`;
    }
    case "locked_admin":
      return "Locked after too many wrong PINs. Ask the administrator to unlock you.";
    case "no_pin":
      return "No PIN set yet. Ask the administrator to set your PIN.";
    default:
      return "This person cannot sign in here. Ask the administrator.";
  }
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s = parts.length > 1 ? parts[0]![0]! + parts[parts.length - 1]![0]! : (parts[0] ?? "?").slice(0, 2);
  return s.toUpperCase();
}

/** Stable pleasant background colour for initials avatars. */
export function avatarColor(seed: string): string {
  const palette = ["#1d4ed8", "#0f766e", "#7c3aed", "#b45309", "#be123c", "#047857", "#4338ca", "#0e7490"];
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length]!;
}

export function avatarUrl(id: string, version: number | null | undefined): string | null {
  return version ? `/api/avatar/${id}?v=${version}` : null;
}
