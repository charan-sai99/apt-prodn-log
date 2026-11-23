"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";
import { getSession } from "@/lib/auth";
import { friendlyDbError } from "@/lib/errors";
import { DEFAULT_OPERATOR_LOGIN_DOMAIN, isOperatorLoginEmail, toLoginEmail } from "@/lib/login-id";
import {
  componentSchema, createUserSchema, employeeCodeSchema, fieldErrors, machineSchema, passwordSchema, roleSchema, shiftSchema,
} from "@/lib/validation";
import type { ActionResult } from "@/lib/types";

const domain = () => process.env.OPERATOR_LOGIN_DOMAIN || DEFAULT_OPERATOR_LOGIN_DOMAIN;
const uuid = z.uuid();

/** Every admin action re-verifies the caller's role from the database. */
async function requireAdmin() {
  const session = await getSession();
  if (!session || session.profile.role !== "admin") return null;
  return session;
}
const DENIED = { ok: false as const, error: "Only administrators can do that." };
const NO_KEY = {
  ok: false as const,
  error: "SUPABASE_SECRET_KEY is not configured on the server, so accounts cannot be created or changed here.",
};

/** Auth changes are outside the audited tables, so log them explicitly. */
async function auditAuth(actorId: string, userId: string, action: string, details: Record<string, unknown>) {
  const admin = createAdminClient();
  await admin.from("production_audit_logs").insert({
    entity_type: "auth_user", entity_id: userId, changed_by: actorId, action, new_values: details,
  });
}

// ------------------------------------------------------------------ users
export async function createUser(input: unknown): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) return DENIED;
  if (!hasAdminKey()) return NO_KEY;
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const email = v.email ? v.email.toLowerCase() : toLoginEmail(v.employeeCode, domain());
  if (!email) return { ok: false, error: "Invalid employee code." };

  const supabase = await createClient();
  const { data: clash } = await supabase.from("profiles").select("id").ilike("employee_code", v.employeeCode).maybeSingle();
  if (clash) return { ok: false, error: "That employee code is already in use.", fieldErrors: { employeeCode: "Already in use" } };

  const admin = createAdminClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password: v.password, email_confirm: true, user_metadata: { display_name: v.displayName },
  });
  if (error || !created.user) {
    return { ok: false, error: /already/i.test(error?.message ?? "") ? "An account with that login already exists." : "Could not create the account." };
  }

  // Profile written with the admin's own session so RLS and the audit trigger apply.
  const { error: pErr } = await supabase.from("profiles").insert({
    id: created.user.id, display_name: v.displayName, employee_code: v.employeeCode, role: v.role, is_active: true,
  });
  if (pErr) {
    await admin.auth.admin.deleteUser(created.user.id); // brand-new, no history: safe to roll back
    return { ok: false, error: friendlyDbError(pErr) };
  }
  await auditAuth(session.userId, created.user.id, "account_created", { email, role: v.role });
  revalidatePath("/admin/users");
  return { ok: true, message: `Account created. ${v.role === "operator" && !v.email ? `Login: ${v.employeeCode}` : `Login: ${email}`}` };
}

export async function setUserActive(userId: string, active: boolean): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) return DENIED;
  if (!uuid.safeParse(userId).success) return { ok: false, error: "Invalid user." };
  if (!hasAdminKey()) return NO_KEY;
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ is_active: active }).eq("id", userId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  // Block sign-in at the auth layer too (and end refresh of existing sessions).
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" });
  await auditAuth(session.userId, userId, active ? "account_reactivated" : "account_deactivated", {});
  revalidatePath("/admin/users");
  revalidatePath("/admin/assignments");
  return { ok: true, message: active ? "Account reactivated" : "Account deactivated and machine assignments ended" };
}

export async function changeRole(userId: string, role: string): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) return DENIED;
  const r = roleSchema.safeParse(role);
  if (!r.success || !uuid.safeParse(userId).success) return { ok: false, error: "Invalid role." };
  const supabase = await createClient();
  if (r.data !== "operator") {
    const { data: asg } = await supabase.from("machine_assignments").select("id").eq("operator_id", userId).eq("is_active", true);
    if (asg && asg.length) return { ok: false, error: "Remove this user's machine assignments before changing them from operator." };
  }
  const { error } = await supabase.from("profiles").update({ role: r.data }).eq("id", userId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/admin/users");
  return { ok: true, message: "Role updated" };
}

export async function updateUserDetails(input: unknown): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) return DENIED;
  const parsed = z.object({ userId: uuid, displayName: z.string().trim().min(2).max(80), employeeCode: employeeCodeSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const supabase = await createClient();
  const { data: before } = await supabase.from("profiles").select("employee_code").eq("id", v.userId).maybeSingle<{ employee_code: string | null }>();
  const { error } = await supabase.from("profiles").update({ display_name: v.displayName, employee_code: v.employeeCode }).eq("id", v.userId);
  if (error) return { ok: false, error: friendlyDbError(error) };

  // Operators sign in with their code: keep the internal login address in step.
  if (before?.employee_code?.toLowerCase() !== v.employeeCode.toLowerCase() && hasAdminKey()) {
    const admin = createAdminClient();
    const { data: u } = await admin.auth.admin.getUserById(v.userId);
    if (u.user?.email && isOperatorLoginEmail(u.user.email, domain())) {
      await admin.auth.admin.updateUserById(v.userId, { email: toLoginEmail(v.employeeCode, domain())!, email_confirm: true });
    }
  }
  revalidatePath("/admin/users");
  return { ok: true, message: "Details saved" };
}

export async function resetUserPassword(userId: string, password: string): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) return DENIED;
  if (!hasAdminKey()) return NO_KEY;
  const p = passwordSchema.safeParse(password);
  if (!p.success || !uuid.safeParse(userId).success) return { ok: false, error: p.error?.issues[0]?.message ?? "Invalid input" };
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: p.data });
  if (error) return { ok: false, error: "Could not set the password." };
  await auditAuth(session.userId, userId, "password_reset_by_admin", {});
  return { ok: true, message: "Password updated. Share it with the user in person." };
}

// ------------------------------------------------------------------ machines
export async function saveMachine(input: unknown): Promise<ActionResult> {
  if (!(await requireAdmin())) return DENIED;
  const parsed = machineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const row = { machine_code: v.machineCode, machine_name: v.machineName, machine_type: v.machineType, sort_order: v.sortOrder };
  const supabase = await createClient();
  const { error } = v.id ? await supabase.from("machines").update(row).eq("id", v.id) : await supabase.from("machines").insert(row);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/admin/machines");
  return { ok: true, message: "Machine saved" };
}

export async function setMachineActive(id: string, active: boolean): Promise<ActionResult> {
  if (!(await requireAdmin())) return DENIED;
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid machine." };
  const supabase = await createClient();
  const { error } = await supabase.from("machines").update({ is_active: active }).eq("id", id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/admin/machines");
  return { ok: true, message: active ? "Machine activated" : "Machine deactivated" };
}

// ------------------------------------------------------------------ components
export async function saveComponent(input: unknown): Promise<ActionResult> {
  if (!(await requireAdmin())) return DENIED;
  const parsed = componentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const row = {
    component_name: v.componentName, component_code: v.componentCode || null,
    zoho_item_id: v.zohoItemId || null, description: v.description || null,
    raw_material: v.rawMaterial ? v.rawMaterial.replace(/\s+/g, " ").toUpperCase() : null,
  };
  const supabase = await createClient();
  const { error } = v.id ? await supabase.from("components").update(row).eq("id", v.id) : await supabase.from("components").insert(row);
  if (error) return { ok: false, error: error.code === "23505" ? "A component with that name or Zoho ID already exists." : friendlyDbError(error) };
  revalidatePath("/admin/components");
  return { ok: true, message: "Component saved" };
}

export async function setComponentActive(id: string, active: boolean): Promise<ActionResult> {
  if (!(await requireAdmin())) return DENIED;
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid component." };
  const supabase = await createClient();
  const { error } = await supabase.from("components").update({ is_active: active }).eq("id", id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/admin/components");
  return { ok: true, message: active ? "Component activated" : "Component deactivated" };
}

// ------------------------------------------------------------------ assignments
/** Supervisors and admins may assign operators to machines. */
async function requireStaff() {
  const session = await getSession();
  if (!session || (session.profile.role !== "admin" && session.profile.role !== "supervisor")) return null;
  return session;
}
const STAFF_DENIED = { ok: false as const, error: "Only supervisors and administrators can do that." };

export async function assignMachine(operatorId: string, machineId: string): Promise<ActionResult> {
  if (!(await requireStaff())) return STAFF_DENIED;
  if (!uuid.safeParse(operatorId).success || !uuid.safeParse(machineId).success) return { ok: false, error: "Invalid selection." };
  const supabase = await createClient();
  const { error } = await supabase.from("machine_assignments").insert({ operator_id: operatorId, machine_id: machineId });
  if (error) return { ok: false, error: error.code === "23505" ? "Already assigned." : friendlyDbError(error) };
  revalidatePath("/admin/assignments");
  return { ok: true, message: "Machine assigned" };
}

export async function unassignMachine(assignmentId: string): Promise<ActionResult> {
  if (!(await requireStaff())) return STAFF_DENIED;
  if (!uuid.safeParse(assignmentId).success) return { ok: false, error: "Invalid assignment." };
  const supabase = await createClient();
  const { error } = await supabase.from("machine_assignments").update({ is_active: false }).eq("id", assignmentId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/admin/assignments");
  return { ok: true, message: "Assignment removed" };
}

// ------------------------------------------------------------------ shifts & settings
export async function saveShift(input: unknown): Promise<ActionResult> {
  if (!(await requireAdmin())) return DENIED;
  const parsed = shiftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the shift.", fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("shifts").upsert({
    code: v.code, name: v.name, start_hour: v.startHour, end_hour: v.endHour, sort_order: v.sortOrder, is_active: v.isActive,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/admin/settings");
  return { ok: true, message: `Shift ${v.code} saved. New entries use it; existing records keep their shift.` };
}

export async function saveSettings(input: unknown): Promise<ActionResult> {
  if (!(await requireAdmin())) return DENIED;
  const parsed = z.object({
    timezone: z.string().refine((tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } }, "Unknown time zone"),
    operatorBackdateDays: z.coerce.number().int().min(0).max(31),
    maxQuantity: z.coerce.number().int().min(1).max(1000000),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the settings.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("prodlog_settings").update({
    timezone: parsed.data.timezone, operator_backdate_days: parsed.data.operatorBackdateDays, max_quantity_per_entry: parsed.data.maxQuantity,
  }).eq("id", true);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved" };
}
