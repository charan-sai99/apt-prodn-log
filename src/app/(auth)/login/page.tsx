import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { signOut } from "../actions";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <AuthShell title="Sign in" subtitle="Use your employee code or email address.">
      {sp.reason === "no-access" && (
        <Alert variant="warning" title="No Production Log access">
          This account is inactive or does not have a Production Log role.
          <form action={signOut} className="mt-2">
            <Button type="submit" variant="outline" size="sm">Sign out</Button>
          </form>
        </Alert>
      )}
      <LoginForm next={sp.next ?? "/"} />
      <p className="text-center text-sm text-muted">
        <Link href="/forgot-password" className="font-semibold text-brand">
          Forgot password?
        </Link>
      </p>
    </AuthShell>
  );
}
