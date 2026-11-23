"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getComponents } from "@/lib/data";
import { friendlyDbError } from "@/lib/errors";
import {
  diffProductionList, mapProductionList, readProductionListWorkbook,
  type ListDiff, type ListIssue, type ProductionComponent,
} from "@/lib/production-list";
import type { ActionResult } from "@/lib/types";

const MAX_BYTES = 2 * 1024 * 1024;

export interface ListPreview {
  fileName: string;
  records: ProductionComponent[];
  issues: ListIssue[];
  diff: ListDiff;
  hideOthers: boolean;
}

async function requireAdmin() {
  const s = await getSession();
  return s && s.profile.role === "admin" ? s : null;
}

/** Reads the uploaded sheet and reports what would change. Writes nothing. */
export async function previewProductionList(formData: FormData): Promise<ActionResult<ListPreview>> {
  if (!(await requireAdmin())) return { ok: false, error: "Only administrators can update the component list." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose the Excel file (.xlsx) first." };
  if (!/\.xlsx$/i.test(file.name)) return { ok: false, error: "Upload an Excel .xlsx file (older .xls files: open in Excel and “Save As” .xlsx)." };
  if (file.size > MAX_BYTES) return { ok: false, error: "The file is larger than 2 MB." };
  const hideOthers = formData.get("hideOthers") !== "false";

  let parsed;
  try {
    parsed = mapProductionList(await readProductionListWorkbook(await file.arrayBuffer()), file.name);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (parsed.records.length === 0) {
    return { ok: false, error: "No part names found under “Production Part Name”." };
  }
  const current = await getComponents(await createClient(), true);
  return {
    ok: true,
    data: {
      fileName: file.name,
      records: parsed.records,
      issues: parsed.issues,
      diff: diffProductionList(parsed.records, current, hideOthers),
      hideOthers,
    },
  };
}

const applySchema = z.object({
  items: z
    .array(z.object({ component_name: z.string().trim().min(1).max(200), raw_material: z.string().trim().max(80).nullable() }))
    .min(1)
    .max(2000),
  hideOthers: z.boolean(),
});

/** Applies the previewed list in one database transaction (audited). */
export async function applyProductionList(input: unknown): Promise<ActionResult<Record<string, number>>> {
  if (!(await requireAdmin())) return { ok: false, error: "Only administrators can update the component list." };
  const parsed = applySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "The list is not valid. Upload the file again." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_production_list", {
    p_items: parsed.data.items,
    p_hide_others: parsed.data.hideOthers,
  });
  if (error) {
    if (/apply_production_list/.test(error.message) && /function|schema cache/i.test(error.message)) {
      return { ok: false, error: "The database update for uploads (migration 0006) hasn't been run in Supabase yet." };
    }
    return { ok: false, error: friendlyDbError(error) };
  }
  const r = (data ?? {}) as Record<string, number>;
  revalidatePath("/admin/components");
  revalidatePath("/entry");
  return {
    ok: true,
    data: r,
    message: `Component list updated: ${r.inserted ?? 0} added, ${r.updated ?? 0} changed, ${r.reactivated ?? 0} re-activated, ${r.hidden ?? 0} hidden.`,
  };
}
