import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSettings, getShifts } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { SettingsForms } from "./settings-forms";

export const metadata = { title: "Shifts & settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const [settings, shifts] = await Promise.all([getSettings(supabase), getShifts(supabase)]);
  return (
    <div className="max-w-3xl">
      <PageHeader title="Shifts & settings" description="The legacy app had no shifts. The defaults (A 06–14, B 14–22, C 22–06) are a starting point — change them to match the factory." />
      <SettingsForms settings={settings} shifts={shifts} />
    </div>
  );
}
