import { NextResponse, type NextRequest } from "next/server";
import { getSession, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchEntries, getSettings } from "@/lib/data";
import { summarize } from "@/lib/aggregate";
import { buildWorkbook, toCsv } from "@/lib/export";
import { parseRecordFilters } from "@/lib/filters";
import { datesBetween, factoryNow, formatTimestamp, periodRange, type ReportPeriod } from "@/lib/time";

export const dynamic = "force-dynamic";

const TITLES: Record<string, string> = {
  daily: "Daily production report",
  weekly: "Weekly production report",
  monthly: "Monthly production report",
};

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!isStaff(session.profile.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  const settings = await getSettings(supabase);
  const today = factoryNow(settings.timezone).date;
  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());

  const period = (["daily", "weekly", "monthly"].includes(sp.period ?? "") ? sp.period : null) as ReportPeriod | null;
  const base = period ? periodRange(period, /^\d{4}-\d{2}-\d{2}$/.test(sp.anchor ?? "") ? sp.anchor! : today) : { from: today, to: today };
  const filters = parseRecordFilters(period ? { ...sp, from: base.from, to: base.to } : sp, base);

  const { rows, error, truncated } = await fetchEntries(supabase, filters);
  if (error) return NextResponse.json({ error: "Could not load records" }, { status: 500 });

  const stamp = filters.from === filters.to ? filters.from : `${filters.from}_to_${filters.to}`;
  const name = `apt-production-${period ?? "records"}-${stamp}`;
  const format = sp.format === "xlsx" ? "xlsx" : "csv";

  if (format === "csv") {
    return new NextResponse(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const filterNotes = [
    filters.machine && `machine ${filters.machine}`,
    filters.shift && `shift ${filters.shift}`,
    filters.operator && "one operator",
    filters.component && "one component",
    filters.q && `search “${filters.q}”`,
    filters.status && filters.status !== "active" && `status ${filters.status}`,
    truncated && "TRUNCATED at 20,000 rows",
  ].filter(Boolean);

  const buf = await buildWorkbook({
    title: `APT — ${period ? TITLES[period] : "Production records"}`,
    subtitle: `${filters.from} to ${filters.to}${filterNotes.length ? ` · ${filterNotes.join(", ")}` : ""}`,
    generatedBy: session.profile.display_name,
    generatedAt: `${formatTimestamp(new Date().toISOString(), settings.timezone)} (${settings.timezone})`,
    rows,
    summary: summarize(rows, { dates: filters.from !== filters.to ? datesBetween(filters.from, filters.to) : undefined }),
  });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
