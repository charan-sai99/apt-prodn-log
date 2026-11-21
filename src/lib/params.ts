import { isValidIsoDate } from "./time";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function str(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.length > 0 ? s : undefined;
}

/** Valid ISO dates with from <= to, falling back to defaults; span capped. */
export function dateRangeParam(
  sp: Record<string, string | string[] | undefined>,
  defaults: { from: string; to: string },
): { from: string; to: string } {
  let from = str(sp.from);
  let to = str(sp.to);
  if (!from || !isValidIsoDate(from)) from = defaults.from;
  if (!to || !isValidIsoDate(to)) to = defaults.to;
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
