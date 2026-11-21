"use client";
import { useActionState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { updatePassword, type FormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function ResetForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(updatePassword, undefined);
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className="h-12" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Repeat new password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required className="h-12" />
      </div>
      {state?.error && <Alert variant="error">{state.error}</Alert>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <KeyRound />} Save password
      </Button>
    </form>
  );
}
