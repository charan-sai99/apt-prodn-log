import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createTestDatabase, Db, expectDbError, seedUser, SUBMIT_SQL } from "./helpers";

// Runs twice: on a fresh project and on one that already has the Stock Portal schema.
for (const variant of [{ name: "prodlog_test_fresh", withStockPortal: false }, { name: "prodlog_test_shared", withStockPortal: true }]) {
  describe(`APT Production Log database (${variant.withStockPortal ? "shared with Stock Portal" : "fresh project"})`, () => {
    let db: Db;
    const ids: Record<string, string> = {};
    const m: Record<string, string> = {};
    const c: Record<string, string> = {};
    let today = "";
    let yesterday = "";
    let tomorrow = "";
    let old = "";

    const submit = (user: string, o: { machine: string; component: string; date?: string; hour?: number; qty?: number; req?: string; operator?: string | null }) =>
      db.as<{ id: string; shift: string; quantity: number; operator_id: string; entered_by: string }>(user, SUBMIT_SQL, [
        o.machine, o.component, o.date ?? yesterday, o.hour ?? 8, o.qty ?? 100, o.req ?? randomUUID(), o.operator ?? null, null,
      ]);

    beforeAll(async () => {
      await createTestDatabase(variant.name, { withStockPortal: variant.withStockPortal });
      db = new Db(variant.name);
      ids.admin = await seedUser(db, "admin", "Admin One", { code: "ADM1" });
      ids.supervisor = await seedUser(db, "supervisor", "Sup One", { code: "SUP1" });
      ids.op1 = await seedUser(db, "operator", "Operator One", { code: "OP1" });
      ids.op2 = await seedUser(db, "operator", "Operator Two", { code: "OP2" });
      ids.inactive = await seedUser(db, "operator", "Former Op", { code: "OP9", active: false });
      ids.customer = await seedUser(db, "customer", "Customer");
      for (const r of await db.owner<{ id: string; machine_code: string }>("select id, machine_code from machines")) m[r.machine_code] = r.id;
      for (const [k, name] of [["a", "N45 SPEEDO POINTER ASSEMBLY"], ["b", "TVS STAR DIAL SPACER"], ["x", "OLD PART"]] as const) {
        const [row] = await db.owner<{ id: string }>("insert into components (component_name, zoho_item_id, is_active) values ($1,$2,$3) returning id", [name, String(Math.floor(Math.random() * 1e15)), k !== "x"]);
        c[k] = row!.id;
      }
      await db.owner("insert into machine_assignments (operator_id, machine_id) values ($1,$2),($3,$4)", [ids.op1, m.VIM1, ids.op2, m.VIM2]);
      const [d] = await db.owner<{ t: string; y: string; n: string; o: string }>(
        "select factory_today()::text t, (factory_today()-1)::text y, (factory_today()+1)::text n, (factory_today()-10)::text o",
      );
      ({ t: today, y: yesterday, n: tomorrow, o: old } = d!);
    });
    afterAll(async () => db?.end());

    describe("schema", () => {
      it("seeds the five legacy machines with legacy codes", async () => {
        const rows = await db.owner<{ machine_code: string; legacy_code: string }>("select machine_code, legacy_code from machines order by sort_order");
        expect(rows.map((r) => r.machine_code)).toEqual(["VIM1", "VIM2", "VIM3", "VIM4", "HIM"]);
        expect(rows.map((r) => r.legacy_code)).toEqual(["vim1", "vim2", "vim3", "vim4", "him"]);
      });
      it("allows the supervisor role and keeps the Stock Portal roles valid", async () => {
        await expectDbError(db.owner("update profiles set role='superuser' where id=$1", [ids.op1]), "profiles_role_check");
      });
      it("enables RLS on every Production Log table", async () => {
        const rows = await db.owner<{ relname: string; relrowsecurity: boolean }>(
          `select relname, relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname = any($1)`,
          [["profiles", "prodlog_settings", "shifts", "machines", "components", "machine_assignments", "production_entries", "correction_requests", "production_audit_logs"]],
        );
        expect(rows).toHaveLength(9);
        expect(rows.every((r) => r.relrowsecurity)).toBe(true);
      });
    });

    describe("authentication & roles", () => {
      it("derives the role from profiles, ignoring inactive and customer accounts", async () => {
        const role = async (u: string) => (await db.as<{ r: string | null }>(u, "select prodlog_role() r"))[0]!.r;
        expect(await role(ids.admin!)).toBe("admin");
        expect(await role(ids.supervisor!)).toBe("supervisor");
        expect(await role(ids.op1!)).toBe("operator");
        expect(await role(ids.inactive!)).toBeNull();
        expect(await role(ids.customer!)).toBeNull();
      });
      it("lets every signed-in user read their own profile (used at sign-in)", async () => {
        for (const u of [ids.admin!, ids.supervisor!, ids.op1!]) {
          const rows = await db.as<{ role: string; is_active: boolean }>(u, "select role, is_active from profiles where id = $1", [u]);
          expect(rows).toHaveLength(1);
        }
        expect(await db.as(ids.op1!, "select id from profiles where id = $1", [ids.op2])).toHaveLength(0);
      });
      it("gives anonymous callers no access", async () => {
        await expectDbError(db.as(null, "select * from production_entries"), "permission denied");
        await expectDbError(db.as(null, SUBMIT_SQL, [m.VIM1, c.a, yesterday, 1, 1, randomUUID(), null, null]), "permission denied");
      });
      it("prevents operators escalating their own role", async () => {
        const rows = await db.as(ids.op1!, "update profiles set role='admin' where id=$1 returning id", [ids.op1]);
        expect(rows).toHaveLength(0); // RLS: no visible row to update
        const [p] = await db.owner<{ role: string }>("select role from profiles where id=$1", [ids.op1]);
        expect(p!.role).toBe("operator");
      });
      it("stops an admin removing their own admin role or the last admin", async () => {
        await expectDbError(db.as(ids.admin!, "update profiles set role='operator' where id=$1", [ids.admin]), "cannot change their own role");
        await expectDbError(db.as(ids.admin!, "update profiles set is_active=false where id=$1", [ids.admin]), "cannot deactivate themselves");
        await expectDbError(db.owner("update profiles set role='supervisor' where id=$1", [ids.admin]), "at least one active administrator");
      });
      it("lets supervisors read profiles but not change them", async () => {
        expect((await db.as(ids.supervisor!, "select id from profiles")).length).toBeGreaterThanOrEqual(5);
        expect(await db.as(ids.supervisor!, "update profiles set display_name='x' where id=$1 returning id", [ids.op1])).toHaveLength(0);
      });
    });

    describe("hourly production submission", () => {
      it("records an entry for the authenticated operator with server-derived fields", async () => {
        const [e] = await submit(ids.op1!, { machine: m.VIM1!, component: c.a!, hour: 7, qty: 250 });
        expect(e!.operator_id).toBe(ids.op1);
        expect(e!.entered_by).toBe(ids.op1);
        expect(e!.quantity).toBe(250);
        expect(e!.shift).toBe("A");
        const [late] = await submit(ids.op1!, { machine: m.VIM1!, component: c.a!, hour: 23 });
        expect(late!.shift).toBe("C");
      });
      it("ignores an operator id supplied by an operator for someone else", async () => {
        await expectDbError(submit(ids.op1!, { machine: m.VIM1!, component: c.a!, hour: 9, operator: ids.op2! }), "FORBIDDEN");
      });
      it("rejects machines the operator is not assigned to", async () => {
        await expectDbError(submit(ids.op1!, { machine: m.VIM2!, component: c.a!, hour: 10 }), "NOT_ASSIGNED");
      });
      it("validates quantity", async () => {
        for (const qty of [0, -5, 100001]) {
          await expectDbError(submit(ids.op1!, { machine: m.VIM1!, component: c.a!, hour: 11, qty }), "INVALID_QUANTITY");
        }
      });
      it("rejects inactive components and future or too-old slots", async () => {
        await expectDbError(submit(ids.op1!, { machine: m.VIM1!, component: c.x!, hour: 12 }), "INACTIVE_COMPONENT");
        await expectDbError(submit(ids.op1!, { machine: m.VIM1!, component: c.a!, date: tomorrow, hour: 0 }), "FUTURE_SLOT");
        await expectDbError(submit(ids.op1!, { machine: m.VIM1!, component: c.a!, date: old, hour: 5 }), "TOO_OLD");
      });
      it("allows a supervisor to record for an assigned operator, including older dates", async () => {
        const [e] = await submit(ids.supervisor!, { machine: m.VIM2!, component: c.b!, date: old, hour: 5, operator: ids.op2! });
        expect(e!.operator_id).toBe(ids.op2);
        expect(e!.entered_by).toBe(ids.supervisor);
      });
      it("blocks inactive and customer accounts", async () => {
        await expectDbError(submit(ids.inactive!, { machine: m.VIM1!, component: c.a! }), "FORBIDDEN");
        await expectDbError(submit(ids.customer!, { machine: m.VIM1!, component: c.a! }), "FORBIDDEN");
      });
      it("accepts the current hour today", async () => {
        const [{ h }] = (await db.owner<{ h: number }>("select extract(hour from now() at time zone factory_timezone())::int h")) as [{ h: number }];
        const [e] = await submit(ids.op1!, { machine: m.VIM1!, component: c.b!, date: today, hour: h });
        expect(e!.id).toBeTruthy();
      });
    });

    describe("duplicate protection", () => {
      it("returns the same record when a request is retried", async () => {
        const req = randomUUID();
        const [a] = await submit(ids.op1!, { machine: m.VIM1!, component: c.b!, hour: 14, req });
        const [b] = await submit(ids.op1!, { machine: m.VIM1!, component: c.b!, hour: 14, req });
        expect(b!.id).toBe(a!.id);
      });
      it("rejects a second record for the same machine, hour and component", async () => {
        await submit(ids.op1!, { machine: m.VIM1!, component: c.a!, hour: 15 });
        await expectDbError(submit(ids.op1!, { machine: m.VIM1!, component: c.a!, hour: 15 }), "DUPLICATE_SLOT");
      });
      it("allows a different component in the same hour", async () => {
        await submit(ids.op1!, { machine: m.VIM1!, component: c.b!, hour: 15 });
      });
      it("does not let another user replay someone else's request id", async () => {
        const req = randomUUID();
        await submit(ids.op1!, { machine: m.VIM1!, component: c.a!, hour: 16, req });
        await expectDbError(submit(ids.op2!, { machine: m.VIM2!, component: c.a!, hour: 16, req }), "FORBIDDEN");
      });
    });

    describe("row-level security on records", () => {
      it("operators only see their own records", async () => {
        await submit(ids.op2!, { machine: m.VIM2!, component: c.a!, hour: 3 });
        const rows = await db.as<{ operator_id: string }>(ids.op1!, "select operator_id from production_entries");
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((r) => r.operator_id === ids.op1)).toBe(true);
        const view = await db.as<{ operator_id: string }>(ids.op1!, "select operator_id from production_entries_enriched");
        expect(view.every((r) => r.operator_id === ids.op1)).toBe(true);
      });
      it("operators only see their assigned machines", async () => {
        const rows = await db.as<{ machine_code: string }>(ids.op1!, "select machine_code from machines");
        expect(rows.map((r) => r.machine_code)).toEqual(["VIM1"]);
      });
      it("supervisors see every record; customers see none", async () => {
        const all = await db.owner<{ n: number }>("select count(*)::int n from production_entries");
        const sup = await db.as<{ n: number }>(ids.supervisor!, "select count(*)::int n from production_entries");
        expect(sup[0]!.n).toBe(all[0]!.n);
        expect((await db.as<{ n: number }>(ids.customer!, "select count(*)::int n from production_entries"))[0]!.n).toBe(0);
        expect((await db.as<{ n: number }>(ids.customer!, "select count(*)::int n from components"))[0]!.n).toBe(0);
      });
      it("nobody can write records directly, even admins", async () => {
        for (const u of [ids.op1!, ids.admin!]) {
          await expectDbError(db.as(u, "insert into production_entries (operator_id, machine_id, component_id, production_date, hour_slot, quantity) values ($1,$2,$3,$4,1,1)", [ids.op1, m.VIM1, c.a, yesterday]), "permission denied");
          await expectDbError(db.as(u, "update production_entries set quantity = 1"), "permission denied");
          await expectDbError(db.as(u, "delete from production_entries"), "permission denied");
        }
      });
      it("records cannot be hard-deleted or re-keyed even by the database owner", async () => {
        await expectDbError(db.owner("delete from production_entries"), "cannot be deleted");
        await expectDbError(db.owner("update production_entries set hour_slot = (hour_slot+1)%24"), "cannot be changed");
      });
    });

    describe("master data permissions", () => {
      it("only admins manage machines and components; operators cannot assign machines", async () => {
        await expectDbError(db.as(ids.op1!, "insert into components (component_name) values ('Hack')"), /row-level security|permission denied/);
        await expectDbError(db.as(ids.supervisor!, "insert into machines (machine_code, machine_name) values ('VIM9','x')"), /row-level security|permission denied/);
        await expectDbError(db.as(ids.op1!, "insert into machine_assignments (operator_id, machine_id) values ($1,$2)", [ids.op1, m.VIM2]), /row-level security|permission denied/);
        expect(await db.as(ids.op1!, "update components set component_name='x' returning id")).toHaveLength(0);
        const [comp] = await db.as<{ id: string }>(ids.admin!, "insert into components (component_name) values ('New Part') returning id");
        expect(comp!.id).toBeTruthy();
        await expectDbError(db.as(ids.admin!, "delete from components where id=$1", [comp!.id]), "permission denied");
      });
      it("rejects assigning machines to non-operators and duplicate assignments", async () => {
        await expectDbError(db.as(ids.admin!, "insert into machine_assignments (operator_id, machine_id) values ($1,$2)", [ids.supervisor, m.VIM3]), "INVALID_OPERATOR");
        await expectDbError(db.as(ids.admin!, "insert into machine_assignments (operator_id, machine_id) values ($1,$2)", [ids.op1, m.VIM1]), "duplicate key");
      });
      it("supervisors can assign and unassign operators, and it is audited", async () => {
        const [a] = await db.as<{ id: string; assigned_by: string }>(ids.supervisor!, "insert into machine_assignments (operator_id, machine_id) values ($1,$2) returning id, assigned_by", [ids.op2, m.VIM3]);
        expect(a!.assigned_by).toBe(ids.supervisor);
        const [u] = await db.as<{ is_active: boolean; unassigned_at: string | null }>(ids.supervisor!, "update machine_assignments set is_active=false where id=$1 returning is_active, unassigned_at", [a!.id]);
        expect(u!.is_active).toBe(false);
        expect(u!.unassigned_at).not.toBeNull();
        const logs = await db.owner<{ changed_by: string; action: string }>("select changed_by, action from production_audit_logs where entity_type='machine_assignments' and entity_id=$1 order by id", [a!.id]);
        expect(logs).toEqual([{ changed_by: ids.supervisor, action: "insert" }, { changed_by: ids.supervisor, action: "update" }]);
        await expectDbError(db.as(ids.supervisor!, "insert into machine_assignments (operator_id, machine_id) values ($1,$2)", [ids.supervisor, m.VIM3]), "INVALID_OPERATOR");
        await expectDbError(db.as(ids.supervisor!, "update machines set machine_name='x' where machine_code='VIM3' returning id").then((r) => { if (r.length === 0) throw new Error("RLS blocked"); }), "RLS blocked");
      });
      it("operators cannot change their own assignments", async () => {
        expect(await db.as(ids.op1!, "update machine_assignments set machine_id=$1 returning id", [m.VIM3])).toHaveLength(0);
      });
    });

    describe("corrections and audit", () => {
      let entryId = "";
      it("lets an operator request a correction without changing the record", async () => {
        const [e] = await submit(ids.op1!, { machine: m.VIM1!, component: c.a!, hour: 18, qty: 120 });
        entryId = e!.id;
        await db.as(ids.op1!, "select request_correction($1,'change','typo on keypad',102,null)", [entryId]);
        const [row] = await db.owner<{ quantity: number }>("select quantity from production_entries where id=$1", [entryId]);
        expect(row!.quantity).toBe(120);
        await expectDbError(db.as(ids.op1!, "select request_correction($1,'change','again',103,null)", [entryId]), "PENDING_EXISTS");
      });
      it("blocks corrections on another operator's record and reviews by operators", async () => {
        await expectDbError(db.as(ids.op2!, "select request_correction($1,'void','not mine',null,null)", [entryId]), "FORBIDDEN");
        const [req] = await db.owner<{ id: string }>("select id from correction_requests where production_entry_id=$1 and status='pending'", [entryId]);
        await expectDbError(db.as(ids.op1!, "select review_correction($1,true,null)", [req!.id]), "FORBIDDEN");
      });
      it("applies an approved change and audits old and new values", async () => {
        const [req] = await db.owner<{ id: string }>("select id from correction_requests where production_entry_id=$1 and status='pending'", [entryId]);
        await db.as(ids.supervisor!, "select review_correction($1,true,'ok')", [req!.id]);
        const [row] = await db.owner<{ quantity: number }>("select quantity from production_entries where id=$1", [entryId]);
        expect(row!.quantity).toBe(102);
        const logs = await db.as<{ action: string; changed_by: string; old_values: { quantity: number }; new_values: { quantity: number } }>(
          ids.supervisor!, "select action, changed_by, old_values, new_values from production_audit_logs where entity_type='production_entries' and entity_id=$1 order by id", [entryId],
        );
        expect(logs.map((l) => l.action)).toEqual(["insert", "update"]);
        expect(logs[1]!.old_values.quantity).toBe(120);
        expect(logs[1]!.new_values.quantity).toBe(102);
        expect(logs[1]!.changed_by).toBe(ids.supervisor);
      });
      it("requires a reason to reject, and voids records on approval", async () => {
        await db.as(ids.op1!, "select request_correction($1,'void','wrong machine',null,null)", [entryId]);
        const [req] = await db.owner<{ id: string }>("select id from correction_requests where production_entry_id=$1 and status='pending'", [entryId]);
        await expectDbError(db.as(ids.supervisor!, "select review_correction($1,false,null)", [req!.id]), "reason");
        await db.as(ids.admin!, "select review_correction($1,true,null)", [req!.id]);
        const [row] = await db.owner<{ status: string }>("select status from production_entries where id=$1", [entryId]);
        expect(row!.status).toBe("voided");
        await expectDbError(db.as(ids.op1!, "select request_correction($1,'change','x y z',5,null)", [entryId]), "voided");
        // The slot is free again after voiding.
        await submit(ids.op1!, { machine: m.VIM1!, component: c.a!, hour: 18, qty: 99 });
      });
      it("hides audit logs from operators and makes them immutable", async () => {
        expect(await db.as(ids.op1!, "select id from production_audit_logs")).toHaveLength(0);
        await expectDbError(db.owner("update production_audit_logs set action='x'"), "AUDIT_IMMUTABLE");
        await expectDbError(db.owner("delete from production_audit_logs"), "AUDIT_IMMUTABLE");
      });
      it("audits administrative changes with the acting admin", async () => {
        await db.as(ids.admin!, "update machines set machine_name='Vertical Injection Moulding 3 (rebuilt)' where machine_code='VIM3'");
        const [log] = await db.owner<{ changed_by: string; action: string }>("select changed_by, action from production_audit_logs where entity_type='machines' order by id desc limit 1");
        expect(log).toEqual({ changed_by: ids.admin, action: "update" });
      });
    });

    describe("deactivation", () => {
      it("ends assignments and blocks submissions when an operator is deactivated", async () => {
        const temp = await seedUser(db, "operator", "Temp Op", { code: `TMP${Math.floor(Math.random() * 1000)}` });
        await db.as(ids.admin!, "insert into machine_assignments (operator_id, machine_id) values ($1,$2)", [temp, m.VIM4]);
        await submit(temp, { machine: m.VIM4!, component: c.a!, hour: 4 });
        await db.as(ids.admin!, "update profiles set is_active=false where id=$1", [temp]);
        const [{ n }] = (await db.owner<{ n: number }>("select count(*)::int n from machine_assignments where operator_id=$1 and is_active", [temp])) as [{ n: number }];
        expect(n).toBe(0);
        await expectDbError(submit(temp, { machine: m.VIM4!, component: c.b!, hour: 4 }), "FORBIDDEN");
        const [{ k }] = (await db.owner<{ k: number }>("select count(*)::int k from production_entries where operator_id=$1", [temp])) as [{ k: number }];
        expect(k).toBe(1); // history preserved
      });
    });

    describe("concurrency", () => {
      it("handles many operators submitting simultaneously", async () => {
        const ops: string[] = [];
        for (let i = 0; i < 10; i++) {
          const id = await seedUser(db, "operator", `Load Op ${i}`, { code: `LD${i}${variant.withStockPortal ? "S" : "F"}` });
          await db.owner("insert into machine_assignments (operator_id, machine_id) values ($1,$2)", [id, m.HIM]);
          ops.push(id);
        }
        // 10 operators × 2 hours, all at once, distinct slots.
        const jobs = ops.flatMap((op, i) => [0, 1].map((h) =>
          db.as(op, SUBMIT_SQL, [m.HIM, i % 2 ? c.a : c.b, yesterday, 2 + (Math.floor(i / 2) * 2) + h, 10 + i, randomUUID(), null, null])));
        const results = await Promise.allSettled(jobs);
        const ok = results.filter((r) => r.status === "fulfilled").length;
        const dup = results.filter((r) => r.status === "rejected" && /DUPLICATE_SLOT/.test(String((r as PromiseRejectedResult).reason))).length;
        expect(ok + dup).toBe(20);
        expect(ok).toBe(20);
      });
      it("lets exactly one of several racing submissions for the same slot win", async () => {
        const racers = await db.owner<{ id: string }>("select operator_id id from machine_assignments where machine_id=$1 and is_active limit 6", [m.HIM]);
        const results = await Promise.allSettled(
          racers.map((r) => db.as(r.id, SUBMIT_SQL, [m.HIM, c.a, yesterday, 22, 77, randomUUID(), null, null])),
        );
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        for (const r of results.filter((x) => x.status === "rejected")) expect(String((r as PromiseRejectedResult).reason)).toMatch(/DUPLICATE_SLOT/);
      });
      it("creates a single record when the same request is sent five times at once", async () => {
        const req = randomUUID();
        const results = await Promise.all(Array.from({ length: 5 }, () => db.as<{ id: string }>(ids.op2!, SUBMIT_SQL, [m.VIM2, c.b, yesterday, 21, 5, req, null, null])));
        expect(new Set(results.map((r) => r[0]!.id)).size).toBe(1);
        const [{ n }] = (await db.owner<{ n: number }>("select count(*)::int n from production_entries where client_request_id=$1", [req])) as [{ n: number }];
        expect(n).toBe(1);
      });
    });
  });
}

describe("legacy import rows (database side)", () => {
  let db: Db;
  beforeAll(async () => {
    await createTestDatabase("prodlog_test_import");
    db = new Db("prodlog_test_import", 5);
  });
  afterAll(async () => db?.end());

  it("accepts legacy rows without an operator account, derives the shift and is idempotent on import_key", async () => {
    const [mach] = await db.owner<{ id: string }>("select id from machines where machine_code='VIM1'");
    const [comp] = await db.owner<{ id: string }>("insert into components (component_name, zoho_item_id) values ('N45', '1') returning id");
    const ins = `insert into production_entries (import_key, machine_id, component_id, production_date, hour_slot, quantity, source, legacy_operator_name, legacy_entered_by_name)
                 values ('legacy:abc', $1, $2, '2026-01-05', 8, 240, 'legacy_import', 'Ravi', 'Suresh')
                 on conflict (import_key) do nothing returning id, shift`;
    const first = await db.owner<{ id: string; shift: string }>(ins, [mach!.id, comp!.id]);
    expect(first[0]!.shift).toBe("A");
    expect(await db.owner(ins, [mach!.id, comp!.id])).toHaveLength(0);
    await expectDbError(
      db.owner("insert into production_entries (machine_id, component_id, production_date, hour_slot, quantity, source) values ($1,$2,'2026-01-05',9,1,'legacy_import')", [mach!.id, comp!.id]),
      "production_entries_operator_known",
    );
    const [log] = await db.owner<{ changed_by: string | null; action: string }>("select changed_by, action from production_audit_logs where entity_id=$1", [first[0]!.id]);
    expect(log).toEqual({ changed_by: null, action: "insert" });
  });
});

describe("production component list (Zoho-independent)", () => {
  let db: Db;
  beforeAll(async () => {
    await createTestDatabase("prodlog_test_plist", { withStockPortal: true });
    db = new Db("prodlog_test_plist", 5);
  });
  afterAll(async () => db?.end());

  it("activates the 24 child parts with raw material and hides older items without deleting them", async () => {
    const seed = (f: string) => readFileSync(path.resolve(__dirname, "../../supabase/seed", f), "utf8");
    await db.owner(seed("components_seed.sql"));
    const [old] = await db.owner<{ id: string }>("select id from components where component_name = 'N45 SPEEDO POINTER ASSEMBLY'");
    const [mach] = await db.owner<{ id: string }>("select id from machines where machine_code='VIM1'");
    const [e] = await db.owner<{ id: string }>(
      "insert into production_entries (machine_id, component_id, production_date, hour_slot, quantity, source, legacy_operator_name) values ($1,$2,'2026-01-05',8,10,'legacy_import','Ravi') returning id",
      [mach!.id, old!.id],
    );
    await db.owner(seed("production_components.sql"));
    await db.owner(seed("production_components.sql")); // re-run is harmless
    const active = await db.owner<{ component_name: string; raw_material: string; zoho_item_id: string | null }>("select component_name, raw_material, zoho_item_id from components where is_active order by component_name");
    expect(active).toHaveLength(24);
    expect(active.every((c) => c.raw_material && c.zoho_item_id === null)).toBe(true);
    expect(active.find((c) => c.component_name === "SPACER 4MM")!.raw_material).toBe("NYLON 30 BLACK");
    const [{ n }] = (await db.owner<{ n: number }>("select count(*)::int n from components")) as [{ n: number }];
    expect(n).toBe(270);
    const [view] = await db.owner<{ component_name: string; raw_material: string | null }>("select component_name, raw_material from production_entries_enriched where id=$1", [e!.id]);
    expect(view!.component_name).toBe("N45 SPEEDO POINTER ASSEMBLY"); // history keeps the old part
  });
});
