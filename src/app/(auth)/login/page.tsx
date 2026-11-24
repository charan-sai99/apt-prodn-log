import Link from "next/link";
import type { Metadata } from "next";
import { LockKeyhole } from "lucide-react";
import { Brand } from "@/components/brand";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getLoginRoster } from "@/lib/roster";
import { DEFAULT_FACTORY_TIMEZONE } from "@/lib/env";
import { signOut } from "../actions";
import { PinLogin } from "./pin-login";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { roster, error } = await getLoginRoster();

  return (
    <main className="min-h-dvh bg-canvas pt-safe">
      <header className="bg-navy-900 px-5 py-4">
        <Brand inverted />
      </header>
      <div className="mx-auto max-w-3xl px-4 pb-10 pt-5">
        <h1 className="text-2xl font-bold text-navy-900">Who is working?</h1>
        <p className="mb-4 text-sm text-muted">Tap your photo, then enter your 4-digit PIN.</p>

        {sp.reason === "no-access" && (
          <Alert variant="warning" title="No Production Log access" className="mb-4">
            This account is inactive or does not have a Production Log role.
            <form action={signOut} className="mt-2"><Button type="submit" variant="outline" size="sm">Sign out</Button></form>
          </Alert>
        )}
        {sp.reason === "idle" && <Alert variant="info" className="mb-4">You were signed out after 10 minutes without activity.</Alert>}
        {error === "not_migrated" && <Alert variant="warning" className="mb-4">Photo sign-in is not set up in the database yet (migration 0007). Administrators can still sign in below.</Alert>}
        {(error === "not_configured" || error === "unavailable") && <Alert variant="warning" className="mb-4">The list of people could not be loaded. Administrators can still sign in below.</Alert>}
        {!error && roster.length === 0 && <Alert variant="info" className="mb-4">No people set up yet. The administrator adds them under Users.</Alert>}

        <PinLogin roster={roster} next={sp.next ?? "/"} timezone={DEFAULT_FACTORY_TIMEZONE} />

        <div className="mt-10 flex justify-center">
          <Button asChild variant="ghost" size="sm" className="text-muted">
            <Link href="/login/admin"><LockKeyhole /> Administrator sign in</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
