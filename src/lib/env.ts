/**
 * Public (browser-safe) configuration. Values are inlined at build time by
 * Next.js because they are referenced with their literal names.
 */
export function getPublicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";
  return { url, key, configured: isValidSupabaseUrl(url) && key.length > 20 };
}

/** The API URL must be https://<ref>.supabase.co (or a custom domain), not the dashboard URL. */
export function isValidSupabaseUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") return false;
    if (u.hostname === "supabase.com" || u.hostname.endsWith(".supabase.com")) return false;
    return true;
  } catch {
    return false;
  }
}

export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export const DEFAULT_FACTORY_TIMEZONE = "Asia/Kolkata";
