"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_OPERATOR_LOGIN_DOMAIN, isOperatorLoginEmail, toLoginEmail } from "@/lib/login-id";
import { safeNextPath } from "@/lib/safe-redirect";
import { getSiteUrl } from "@/lib/env";
import { passwordSchema } from "@/lib/validation";

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

  redirect(next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
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
