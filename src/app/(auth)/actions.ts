"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_OPERATOR_LOGIN_DOMAIN, isOperatorLoginEmail, toLoginEmail } from "@/lib/login-id";
import { safeNextPath } from "@/lib/safe-redirect";
import { getSiteUrl } from "@/lib/env";
import { passwordSchema } from "@/lib/validation";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";
import { PIN_RE, type PinResult } from "@/lib/pin-login";
import { UUID_RE } from "@/lib/params";

export type FormState = { error?: string; message?: string } | undefined;

const loginDomain = () => process.env.OPERATOR_LOGIN_DOMAIN || DEFAULT_OPERATOR_LOGIN_DOMAIN;

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const identifier = String(formData.get("identifier") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));

  const email = toLoginEmail(identifier, loginDomain());
  if (!email || !password) return { error: "Enter your employee code (or email) and password." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { error: "Incorrect employee code / email or password." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", data.user.id)
    .maybeSingle<{ role: string; is_active: boolean }>();

  if (!profile || !profile.is_active || !["operator", "supervisor", "admin"].includes(profile.role)) {
    await supabase.auth.signOut();
    return { error: "This account does not have access to the Production Log. Contact your administrator." };
  }
  if (profile.role !== "admin") {
    await supabase.auth.signOut();
    return { error: "Operators and supervisors sign in with their photo and PIN on the main sign-in screen." };
  }

  redirect(next);
}

/**
 * Photo + PIN sign-in for operators and supervisors. The PIN is checked in the
 * database (with lockout); on success the server mints a normal Supabase
 * session for that person, so every permission check stays exactly as before.
 */
export async function pinSignIn(profileId: string, pin: string): Promise<PinResult | { ok: false; reason: "error"; message: string }> {
  if (!UUID_RE.test(profileId) || !PIN_RE.test(pin)) return { ok: false, reason: "unavailable" };
  if (!hasAdminKey()) return { ok: false, reason: "error", message: "Sign-in is not configured on the server (secret key missing)." };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("verify_profile_pin", { p_profile_id: profileId, p_pin: pin });
  if (error) return { ok: false, reason: "error", message: "Sign-in is not available right now. Try again in a minute." };
  const result = data as PinResult;
  if (!result.ok) return result;

  const { data: userData, error: userErr } = await admin.auth.admin.getUserById(profileId);
  const email = userData?.user?.email;
  if (userErr || !email) return { ok: false, reason: "error", message: "This person's account is incomplete. Ask the administrator." };

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkErr || !tokenHash) return { ok: false, reason: "error", message: "Could not start the session. Try again." };

  const supabase = await createClient();
  await supabase.auth.signOut(); // replace whoever was signed in on this device
  const { error: otpErr } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (otpErr) return { ok: false, reason: "error", message: "Could not start the session. Try again." };
  return result;
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Automatic sign-out after inactivity on shared factory phones. */
export async function signOutIdle() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login?reason=idle");
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!z.email().safeParse(email).success) return { error: "Enter the email address on your account." };
  if (isOperatorLoginEmail(email, loginDomain())) {
    return { error: "Operator accounts are reset by an administrator. Please ask your supervisor." };
  }
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getSiteUrl()}/auth/confirm?next=/reset-password`,
  });
  // Same response whether or not the address exists.
  return { message: "If that email has an account, a reset link is on its way. Check your inbox." };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (password !== confirm) return { error: "The two passwords do not match." };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "Your reset link has expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Could not update the password. Try a different one." };
  redirect("/?password=updated");
}
