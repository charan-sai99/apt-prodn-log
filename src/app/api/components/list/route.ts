import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getComponents } from "@/lib/data";
import { buildProductionListWorkbook } from "@/lib/production-list";

export const dynamic = "force-dynamic";

/** The active production component list as .xlsx, in the upload format. Admins only. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.profile.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const components = (await getComponents(await createClient())).sort((a, b) => a.component_name.localeCompare(b.component_name));
  const buf = await buildProductionListWorkbook(components);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="APT_ProdnList_${date}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
