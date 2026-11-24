import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";
import { UUID_RE } from "@/lib/params";

/** Employee photo for the sign-in screen and in-app avatars (photos are deliberately public). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id) || !hasAdminKey()) return new NextResponse(null, { status: 404 });
  const { data, error } = await createAdminClient().rpc("get_profile_photo", { p_profile_id: id });
  const row = Array.isArray(data) ? (data[0] as { content_type: string; data_base64: string } | undefined) : undefined;
  if (error || !row) return new NextResponse(null, { status: 404 });
  const versioned = request.nextUrl.searchParams.has("v");
  return new NextResponse(new Uint8Array(Buffer.from(row.data_base64, "base64")), {
    headers: {
      "Content-Type": row.content_type,
      // URLs carry ?v=<updated_at>, so a new photo gets a new URL.
      "Cache-Control": versioned ? "public, max-age=2592000, immutable" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
