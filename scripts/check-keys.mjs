#!/usr/bin/env node
/**
 * npm run check:keys
 * Checks the Supabase settings in .env.local WITHOUT printing any key:
 * shows only the key type (first 10 characters), its length, obvious copy mistakes,
 * and whether Supabase accepts it. Safe to paste the output into a chat.
 */
import { existsSync, readFileSync } from "node:fs";

const file = ".env.local";
if (!existsSync(file)) {
  console.log(`✖ ${file} not found. Run this from the apt-prodn-log folder.`);
  process.exit(1);
}
const lines = readFileSync(file, "utf8").split(/\r?\n/);
const vars = {};
const counts = {};
for (const line of lines) {
  const m = /^\s*([A-Z0-9_]+)\s*=(.*)$/.exec(line);
  if (!m) continue;
  counts[m[1]] = (counts[m[1]] ?? 0) + 1;
  vars[m[1]] = m[2];
}

const NAMES = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const clean = (v) => (v ?? "").trim().replace(/^["']|["']$/g, "");
let problems = 0;

console.log(`\nSettings in ${file} (keys are never shown):\n`);
for (const n of NAMES) {
  if (!(n in vars)) continue;
  const raw = vars[n];
  const v = clean(raw);
  const notes = [];
  if (counts[n] > 1) notes.push(`appears ${counts[n]} times (the LAST one is used)`);
  if (raw !== raw.trim()) notes.push("has spaces around it");
  if (/["']/.test(raw)) notes.push("has quotes");
  if (/\s/.test(v)) notes.push("has a space inside");
  if (/…|\.\.\./.test(v)) notes.push("contains '…' — looks like a shortened copy");
  if (process.env[n] !== undefined) notes.push("ALSO set as a Windows environment variable, which overrides this file");
  const shown = n.endsWith("URL") ? v.replace(/^https:\/\/([a-z0-9]{4})[a-z0-9]+/, "https://$1…") : `${v.slice(0, 10)}…`;
  console.log(`  ${n.padEnd(38)} ${shown.padEnd(26)} length ${String(v.length).padStart(3)}${notes.length ? "   ⚠ " + notes.join("; ") : ""}`);
  problems += notes.length;
}

const url = clean(vars.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
const pub = clean(vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || vars.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const secret = clean(vars.SUPABASE_SECRET_KEY || vars.SUPABASE_SERVICE_ROLE_KEY);

const secretName = vars.SUPABASE_SECRET_KEY ? "SUPABASE_SECRET_KEY" : "SUPABASE_SERVICE_ROLE_KEY";
if (secret && secret.startsWith("sb_publishable_")) {
  console.log(`\n  ⚠ ${secretName} holds the PUBLISHABLE key. It must be the SECRET key (starts with sb_secret_).`);
  problems++;
}
if (secret && pub && secret === pub) {
  console.log(`\n  ⚠ The secret key is the same as the publishable key.`);
  problems++;
}

async function probe(label, path, key, bearer) {
  try {
    const headers = { apikey: key };
    if (bearer) headers.Authorization = `Bearer ${key}`;
    const r = await fetch(url + path, { headers });
    const ok = r.status >= 200 && r.status < 300;
    console.log(`  ${label.padEnd(38)} ${ok ? "✓ accepted by Supabase" : `✖ rejected by Supabase (HTTP ${r.status})`}`);
    if (!ok) problems++;
  } catch (e) {
    console.log(`  ${label.padEnd(38)} ? could not reach Supabase (${e.cause?.code ?? e.message})`);
    problems++;
  }
}

console.log("\nTesting against Supabase:\n");
if (!url) console.log("  ✖ NEXT_PUBLIC_SUPABASE_URL is missing");
else {
  if (pub) await probe("Publishable key", "/auth/v1/settings", pub, false);
  else console.log("  ✖ Publishable key missing");
  if (secret) await probe("Secret key", "/auth/v1/admin/users?per_page=1", secret, true);
  else console.log("  ✖ Secret key missing (SUPABASE_SECRET_KEY)");
}
console.log(problems ? "\nSomething needs fixing — see ⚠ / ✖ above.\n" : "\nAll good.\n");
process.exit(problems ? 1 : 0);
