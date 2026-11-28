import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Administrator sign in" };

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <AuthShell title="Administrator sign in" subtitle="Email and password. Operators and supervisors use their photo.">
      <LoginForm next={sp.next ?? "/"} />
      <div className="flex items-center justify-between text-sm">
        <Link href="/login" className="inline-flex items-center gap-1 font-semibold text-brand"><ArrowLeft className="size-4" /> Back to photos</Link>
        <Link href="/forgot-password" className="font-semibold text-brand">Forgot password?</Link>
      </div>
    </AuthShell>
  );
}
