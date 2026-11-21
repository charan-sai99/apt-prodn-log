const MESSAGES: Record<string, string> = {
  DUPLICATE_SLOT: "A record already exists for this machine, component and hour. Use “Request correction” on the existing record instead.",
  NOT_ASSIGNED: "You are not assigned to this machine. Ask an administrator to assign you.",
  INVALID_QUANTITY: "Enter a whole number greater than zero.",
  FUTURE_SLOT: "Production time cannot be in the future.",
  TOO_OLD: "That date is too far back for operators. Ask a supervisor to record it.",
  INACTIVE_MACHINE: "This machine is not active.",
  INACTIVE_COMPONENT: "This component is not active.",
  INVALID_OPERATOR: "Choose an active operator.",
  PENDING_EXISTS: "A correction for this record is already waiting for review.",
  NOT_FOUND: "The record could not be found or is no longer available.",
  FORBIDDEN: "You do not have permission to do that.",
  INVALID_INPUT: "Please check the form and try again.",
};

/**
 * Turn a database / RPC error into a message safe to show users. RPC errors
 * start with a code word ("DUPLICATE_SLOT: …"); the detail after the colon is
 * written for users, so it is preferred when present.
 */
export function friendlyDbError(err: { message?: string; code?: string } | null | undefined): string {
  const msg = err?.message ?? "";
  const m = /^([A-Z_]+):\s*(.*)$/s.exec(msg);
  if (m) {
    const code = m[1]!;
    const detail = m[2]!.trim();
    if (code === "DUPLICATE_SLOT" || code === "NOT_ASSIGNED") return MESSAGES[code]!;
    return detail || MESSAGES[code] || "Something went wrong. Please try again.";
  }
  if (err?.code === "23505") return "That value is already in use.";
  if (err?.code === "42501") return MESSAGES.FORBIDDEN!;
  if (/fetch failed|network/i.test(msg)) return "Network problem — check the connection and try again.";
  return "Something went wrong. Please try again.";
}

export function errorCode(err: { message?: string } | null | undefined): string | null {
  const m = /^([A-Z_]+):/.exec(err?.message ?? "");
  return m ? m[1]! : null;
}
