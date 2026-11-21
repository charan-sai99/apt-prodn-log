"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession, isStaff } from "@/lib/auth";
import { friendlyDbError } from "@/lib/errors";
import { fieldErrors, reviewSchema } from "@/lib/validation";
import type { ActionResult } from "@/lib/types";

export async function reviewCorrection(input: unknown): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isStaff(session.profile.role)) return { ok: false, error: "You do not have permission to do that." };
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_correction", {
    p_request_id: parsed.data.requestId,
    p_approve: parsed.data.approve,
    p_note: parsed.data.note || null,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/corrections");
  revalidatePath("/records");
  revalidatePath("/dashboard");
  return { ok: true, message: parsed.data.approve ? "Correction approved and applied" : "Correction rejected" };
}
