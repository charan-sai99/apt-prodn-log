import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Alert } from "@/components/ui/alert";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Reset password" };

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const { expired } = await searchParams;
  return (
    <AuthShell title="Reset password" subtitle="Supervisors and administrators can reset by email.">
      {expired && <Alert variant="warning">That link has expired or was already used. Request a new one.</Alert>}
      <Alert variant="info">Operators: ask your supervisor or administrator to set a new password for you.</Alert>
      <ForgotForm />
      <p className="text-center text-sm">
        <Link href="/login" className="font-semibold text-brand">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
