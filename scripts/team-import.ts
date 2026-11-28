#!/usr/bin/env tsx
/**
 * Adds the factory team (names, designations, photos) for photo + PIN sign-in.
 *
 *   npm run import:team -- --dir <folder with team.json and photos/>
 *       dry run: shows who will be added or updated; changes nothing
 *   npm run import:team -- --dir <folder> --apply --project-ref <ref>
 *
 * team.json: { "people": [ { "name", "designation", "role", "displayOrder", "photo" } ] }
 * Matches existing people by name (case-insensitive), so it is safe to run again.
 * It never sets PINs (the administrator does that in the app) and never changes
 * the role of someone who already exists. Needs migration 0007 and
 * SUPABASE_SECRET_KEY in .env.local.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { codeFromName } from "../src/lib/validation";
import { DEFAULT_OPERATOR_LOGIN_DOMAIN, toLoginEmail } from "../src/lib/login-id";

const teamSchema = z.object({
  people: z.array(z.object({
    name: z.string().trim().min(2).max(80),
    designation: z.string().trim().max(60).nullable().optional(),
    role: z.enum(["operator", "supervisor"]),
    displayOrder: z.number().int().min(0).max(9999),
    photo: z.string().regex(/^[\w.-]+\.(jpe?g|png|webp)$/i).nullable().optional(),
  })).min(1),
});

function args() {
  const a: Record<string, string | boolean> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!;
    if (!k.startsWith("--")) continue;
    const n = argv[i + 1];
    if (n && !n.startsWith("--")) { a[k.slice(2)] = n; i++; } else a[k.slice(2)] = true;
  }
  return a;
}

function loadEnv(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "").trim();
  }
}

async function main() {
  const a = args();
  loadEnv(String(a.env ?? ".env.local"));
  const dir = String(a.dir ?? "");
  if (!dir || !existsSync(path.join(dir, "team.json"))) throw new Error("--dir must be a folder containing team.json");
  const team = teamSchema.parse(JSON.parse(readFileSync(path.join(dir, "team.json"), "utf8")));
  const apply = a.apply === true;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!key) throw new Error("SUPABASE_SECRET_KEY is missing in .env.local (Supabase → Project Settings → API Keys → Secret key).");
  const host = new URL(url).hostname;
  if (apply && a["project-ref"] !== host.split(".")[0]) throw new Error("--project-ref does not match NEXT_PUBLIC_SUPABASE_URL. Nothing written.");
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const domain = process.env.OPERATOR_LOGIN_DOMAIN || DEFAULT_OPERATOR_LOGIN_DOMAIN;

  const { data: existing, error } = await sb.from("profiles").select("id, display_name, employee_code, role, designation, display_order");
  if (error) {
    throw new Error(/designation|display_order/.test(error.message)
      ? "Migration 0007 has not been run in Supabase yet. Run it first, then this import."
      : `Could not read people: ${error.message}`);
  }
  const byName = new Map((existing ?? []).map((p) => [String(p.display_name).trim().toLowerCase(), p]));
  const usedCodes = new Set((existing ?? []).map((p) => String(p.employee_code ?? "").toUpperCase()).filter(Boolean));

  console.log(`\n${apply ? "APPLY" : "DRY RUN — nothing will be changed"}  ·  ${team.people.length} people from ${path.resolve(dir)}\n`);
  let created = 0, updated = 0, photos = 0;
  for (const p of team.people) {
    const photoFile = p.photo ? path.join(dir, "photos", p.photo) : null;
    if (photoFile && !existsSync(photoFile)) throw new Error(`Photo not found: ${photoFile}`);
    const hit = byName.get(p.name.toLowerCase());
    const label = `${p.name.padEnd(24)} ${String(p.designation ?? "").padEnd(18)} ${p.photo ? "photo ✓" : "no photo"}`;

    let id: string | undefined = hit?.id;
    if (hit) {
      console.log(`  update  ${label}  (role stays ${hit.role})`);
      if (apply) {
        const { error: e } = await sb.from("profiles").update({ designation: p.designation ?? null, display_order: p.displayOrder }).eq("id", hit.id);
        if (e) throw new Error(`Updating ${p.name} failed: ${e.message}`);
      }
      updated++;
    } else {
      let code = codeFromName(p.name);
      for (let i = 2; usedCodes.has(code.toUpperCase()); i++) code = `${codeFromName(p.name)}${i}`;
      usedCodes.add(code.toUpperCase());
      console.log(`  add     ${label}  role ${p.role}, code ${code}`);
      if (apply) {
        const email = toLoginEmail(code, domain)!;
        const { data: u, error: ue } = await sb.auth.admin.createUser({
          email, password: randomBytes(24).toString("base64url"), email_confirm: true, user_metadata: { display_name: p.name },
        });
        if (ue || !u.user) throw new Error(`Creating ${p.name} failed: ${ue?.message ?? "unknown error"}`);
        id = u.user.id;
        const { error: pe } = await sb.from("profiles").insert({
          id, display_name: p.name, employee_code: code, role: p.role, is_active: true,
          designation: p.designation ?? null, display_order: p.displayOrder, show_on_login: true,
        });
        if (pe) {
          await sb.auth.admin.deleteUser(id);
          throw new Error(`Saving ${p.name} failed: ${pe.message}`);
        }
      }
      created++;
    }
    if (photoFile) {
      if (apply && id) {
        const data = readFileSync(photoFile).toString("base64");
        const { error: fe } = await sb.from("profile_photos").upsert({ profile_id: id, content_type: photoType(photoFile), data_base64: data, updated_at: new Date().toISOString() });
        if (fe) throw new Error(`Photo for ${p.name} failed: ${fe.message}`);
      }
      photos++;
    }
  }
  console.log(`\n${apply ? "Done" : "Would do"}: ${created} added, ${updated} updated, ${photos} photos. PINs are set by the administrator in the app (People page).\n`);
}

main().catch((e) => {
  console.error(`\n✖ ${(e as Error).message}\n`);
  process.exit(1);
});

function photoType(file: string): "image/jpeg" | "image/png" | "image/webp" {
  const ext = path.extname(file).toLowerCase();
  return ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
}
