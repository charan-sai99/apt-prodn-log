import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * profile id → photo version, for <Avatar>. One small query per request (cached).
 * People without a photo are simply absent (Avatar then shows coloured initials),
 * and an empty map comes back if the photo tables are not set up yet.
 */
export const getPhotoVersions = cache(async (): Promise<Record<string, number>> => {
  try {
    const { data, error } = await (await createClient()).rpc("profile_photo_versions");
    if (error || !data) return {};
    return Object.fromEntries((data as { profile_id: string; photo_version: number }[]).map((p) => [p.profile_id, Number(p.photo_version)]));
  } catch {
    return {};
  }
});
