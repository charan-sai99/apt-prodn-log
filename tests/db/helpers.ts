/**
 * Local database test harness. Builds a throwaway database from the Supabase
 * stub + the real migrations, and runs statements as simulated Supabase users
 * (role `authenticated` with JWT claims), exactly the way PostgREST does.
 * Requires PG_TEST_URL pointing at a LOCAL server, e.g.
 *   postgres://postgres@localhost:54329/postgres
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";

const ROOT = path.resolve(__dirname, "../..");

export function testUrl(db?: string): string {
  const base = process.env.PG_TEST_URL;
  if (!base) throw new Error("PG_TEST_URL is not set (local PostgreSQL only).");
  const u = new URL(base);
  if (!["localhost", "127.0.0.1", "::1", ""].includes(u.hostname) && !u.searchParams.get("host")?.startsWith("/")) {
    throw new Error("Refusing to run DB tests against a non-local server.");
  }
  if (db) u.pathname = `/${db}`;
  return u.toString();
}

export async function createTestDatabase(name: string, opts: { withStockPortal?: boolean } = {}) {
  const admin = new pg.Client({ connectionString: testUrl() });
  await admin.connect();
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.query(`create database ${name}`);
  await admin.end();

  const c = new pg.Client({ connectionString: testUrl(name) });
  await c.connect();
  await c.query("set client_min_messages = warning");
  await c.query(readFileSync(path.join(ROOT, "supabase/tests/supabase_stub.sql"), "utf8"));
  if (opts.withStockPortal) {
    const sp = path.join(ROOT, "supabase/tests/fixtures/stock-portal");
    for (const f of readdirSync(sp).sort()) await c.query(readFileSync(path.join(sp, f), "utf8"));
  }
  const dir = path.join(ROOT, "supabase/migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    await c.query(readFileSync(path.join(dir, f), "utf8"));
  }
  await c.end();
}

export class Db {
  pool: pg.Pool;
  constructor(name: string, max = 30) {
    this.pool = new pg.Pool({ connectionString: testUrl(name), max });
  }
  /** Run as the database owner (like the SQL editor / service role). */
  async owner<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const r = await this.pool.query(sql, params);
    return r.rows as T[];
  }
  /** Run as a signed-in Supabase user (RLS + grants apply). */
  async as<T = Record<string, unknown>>(userId: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(`set local role ${userId ? "authenticated" : "anon"}`);
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify(userId ? { sub: userId, role: "authenticated" } : { role: "anon" }),
      ]);
      const r = await client.query(sql, params);
      await client.query("commit");
      return r.rows as T[];
    } catch (e) {
      await client.query("rollback").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }
  async end() {
    await this.pool.end();
  }
}

export async function seedUser(db: Db, role: string, name: string, opts: { code?: string; active?: boolean } = {}) {
  const id = randomUUID();
  await db.owner("insert into auth.users (id, email) values ($1, $2)", [id, `${name.toLowerCase().replace(/\W/g, "")}-${id.slice(0, 6)}@test.local`]);
  await db.owner(
    "insert into public.profiles (id, display_name, role, employee_code, is_active) values ($1,$2,$3,$4,$5)",
    [id, name, role, opts.code ?? null, opts.active ?? true],
  );
  return id;
}

export async function expectDbError(p: Promise<unknown>, match: RegExp | string): Promise<string> {
  try {
    await p;
  } catch (e) {
    const msg = (e as Error).message;
    if (typeof match === "string" ? !msg.includes(match) : !match.test(msg)) {
      throw new Error(`Expected error matching ${match}, got: ${msg}`);
    }
    return msg;
  }
  throw new Error(`Expected error matching ${match}, but the statement succeeded`);
}

export const SUBMIT_SQL =
  "select * from public.submit_production_entry($1::uuid,$2::uuid,$3::date,$4::int,$5::int,$6::uuid,$7::uuid,$8::text)";
