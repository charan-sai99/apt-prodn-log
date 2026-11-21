"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { friendlyDbError } from "@/lib/errors";
import { correctionSchema, entrySchema, fieldErrors } from "@/lib/validation";
import type { ActionResult } from "@/lib/types";

export async function submitEntry(input: unknown): Promise<ActionResult<{ id: string; replay: boolean }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Your session has ended. Please sign in again." };

  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  }
  const v = parsed.data;
  // Operators can never act for someone else; the database enforces this too.
  const operatorId = session.profile.role === "operator" ? null : (v.operatorId ?? null);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_production_entry", {
    p_machine_id: v.machineId,
    p_component_id: v.componentId,
    p_production_date: v.productionDate,
    p_hour_slot: v.hourSlot,
    p_quantity: v.quantity,
    p_client_request_id: v.clientRequestId,
    p_operator_id: operatorId,
    p_notes: v.notes || null,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };

  const row = data as { id: string; created_at: string } | null;
  revalidatePath("/entry");
  revalidatePath("/history");
  return {
    ok: true,
    data: { id: row?.id ?? "", replay: false },
    message: "Production recorded",
  };
}

export async function requestCorrection(input: unknown): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Your session has ended. Please sign in again." };
  const parsed = correctionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
  }
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_correction", {
    p_entry_id: v.entryId,
    p_request_type: v.requestType,
    p_reason: v.reason,
    p_proposed_quantity: v.requestType === "change" ? (v.proposedQuantity ?? null) : null,
    p_proposed_component_id: v.requestType === "change" ? (v.proposedComponentId ?? null) : null,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/entry");
  revalidatePath("/history");
  revalidatePath("/my-corrections");
  revalidatePath("/corrections");
  return { ok: true, message: "Correction request sent to your supervisor" };
}

export async function cancelCorrection(requestId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Your session has ended. Please sign in again." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_correction", { p_request_id: requestId });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/my-corrections");
  revalidatePath("/entry");
  return { ok: true, message: "Request cancelled" };
}
