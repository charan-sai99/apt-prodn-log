import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getComponents } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { ComponentsManager } from "./components-manager";

export const metadata = { title: "Components" };
export const dynamic = "force-dynamic";

export default async function ComponentsPage() {
  await requireRole("admin");
  const components = await getComponents(await createClient(), true);
  return (
    <div>
      <PageHeader title="Component master" description={`${components.filter((c) => c.is_active).length} active of ${components.length}. Only active components can be selected by operators. Production parts don't need a Zoho ID.`} />
      <ComponentsManager components={components} />
    </div>
  );
}
