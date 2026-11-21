import { AuthShell } from "@/components/auth-shell";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Choose a new password" };

export default function ResetPage() {
  return (
    <AuthShell title="Choose a new password" subtitle="At least 8 characters.">
      <ResetForm />
    </AuthShell>
  );
}
