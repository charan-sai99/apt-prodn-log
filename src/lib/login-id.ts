export const DEFAULT_OPERATOR_LOGIN_DOMAIN = "operators.apt.internal";

const EMPLOYEE_CODE = /^[A-Za-z0-9_.-]{2,32}$/;

export function isValidEmployeeCode(code: string): boolean {
  return EMPLOYEE_CODE.test(code);
}

/**
 * Operators without an email address sign in with their employee code.
 * Supabase Auth needs an email, so the code maps to a fixed internal address.
 * Anything containing "@" is treated as a real email address.
 */
export function toLoginEmail(identifier: string, domain = DEFAULT_OPERATOR_LOGIN_DOMAIN): string | null {
  const value = identifier.trim();
  if (!value) return null;
  if (value.includes("@")) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value.toLowerCase() : null;
  }
  if (!isValidEmployeeCode(value)) return null;
  return `${value.toLowerCase()}@${domain.toLowerCase()}`;
}

export function isOperatorLoginEmail(email: string, domain = DEFAULT_OPERATOR_LOGIN_DOMAIN): boolean {
  return email.toLowerCase().endsWith(`@${domain.toLowerCase()}`);
}
