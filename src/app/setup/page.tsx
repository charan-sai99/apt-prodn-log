import { AuthShell } from "@/components/auth-shell";
import { Alert } from "@/components/ui/alert";
import { getPublicSupabaseEnv } from "@/lib/env";

export const metadata = { title: "Configuration needed" };
export const dynamic = "force-dynamic";

export default function SetupPage() {
  const env = getPublicSupabaseEnv();
  return (
    <AuthShell title="Configuration needed" subtitle="The app is not connected to Supabase yet.">
      {env.configured ? (
        <Alert variant="success">Supabase is configured. You can sign in.</Alert>
      ) : (
        <Alert variant="warning" title="Missing or invalid Supabase settings">
          Set <code>NEXT_PUBLIC_SUPABASE_URL</code> (https://&lt;project-ref&gt;.supabase.co — not the dashboard address)
          and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> in the environment, then redeploy.
        </Alert>
      )}
    </AuthShell>
  );
}
