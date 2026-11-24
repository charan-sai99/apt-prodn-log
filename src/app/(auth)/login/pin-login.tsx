"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Delete, Loader2, X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import { Avatar } from "@/components/avatar";
import { pinErrorMessage, type RosterEntry } from "@/lib/pin-login";
import { cn } from "@/lib/utils";
import { pinSignIn } from "../actions";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;

export function PinLogin({ roster, next, timezone }: { roster: RosterEntry[]; next: string; timezone: string }) {
  const router = useRouter();
  const [person, setPerson] = useState<RosterEntry | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  const close = () => {
    if (busy) return;
    setPerson(null);
    setPin("");
    setError(null);
  };

  const press = (k: string) => {
    if (busy) return;
    setError(null);
    if (k === "del") setPin((p) => p.slice(0, -1));
    else if (k) setPin((p) => (p.length < 4 ? p + k : p));
  };

  // Submit automatically when the 4th digit is entered.
  useEffect(() => {
    if (pin.length !== 4 || !person || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    pinSignIn(person.id, pin)
      .then((res) => {
        if (res.ok) {
          router.replace(next && next !== "/" ? next : res.role === "operator" ? "/entry" : "/dashboard");
          router.refresh();
          return; // keep the spinner until the next page shows
        }
        setError("message" in res ? res.message : pinErrorMessage(res, timezone));
        setPin("");
        setBusy(false);
      })
      .catch(() => {
        setError("Network problem — check the connection and try again.");
        setPin("");
        setBusy(false);
      })
      .finally(() => {
        submitting.current = false;
      });
  }, [pin, person, next, router, timezone]);

  // Physical keyboard support (tablets with keyboards, desktop testing).
  useEffect(() => {
    if (!person) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("del");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
        {roster.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => { setPerson(p); setPin(""); setError(null); }}
              className="flex w-full flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-3 text-center shadow-sm active:scale-[0.98] active:bg-slate-50"
            >
              <Avatar id={p.id} name={p.display_name} version={p.photo_version} size={84} />
              <span className="line-clamp-2 text-sm font-bold leading-tight text-navy-900">{p.display_name}</span>
              <span className="line-clamp-1 text-[11px] font-medium text-muted">
                {p.machines.length ? p.machines.join(" · ") : (p.designation ?? (p.role === "supervisor" ? "Supervisor" : "Operator"))}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <D.Root open={Boolean(person)} onOpenChange={(o) => !o && close()}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-navy-950/70" />
          <D.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-surface p-5 pb-safe shadow-xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
            {person && (
              <div className="flex flex-col items-center">
                <D.Close className="absolute right-4 top-4 rounded-full p-2 text-muted hover:bg-slate-100" aria-label="Back to photos" disabled={busy}>
                  <X className="size-6" />
                </D.Close>
                <Avatar id={person.id} name={person.display_name} version={person.photo_version} size={96} />
                <D.Title className="mt-2 text-xl font-bold text-navy-900">{person.display_name}</D.Title>
                <D.Description className="text-sm text-muted">Enter your 4-digit PIN</D.Description>

                <div className="my-5 flex gap-4" aria-live="polite" aria-label={`${pin.length} of 4 digits entered`}>
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className={cn("size-4 rounded-full border-2", i < pin.length ? "border-navy-900 bg-navy-900" : "border-slate-300")} />
                  ))}
                </div>

                <p role="alert" className="mb-3 min-h-10 text-center text-sm font-semibold text-danger">
                  {busy ? <Loader2 className="mx-auto size-6 animate-spin text-brand" aria-label="Signing in" /> : error}
                </p>

                <div className="grid w-full max-w-xs grid-cols-3 gap-3">
                  {KEYS.map((k, i) =>
                    k === "" ? (
                      <span key={i} />
                    ) : (
                      <button
                        key={i}
                        type="button"
                        onClick={() => press(k)}
                        disabled={busy}
                        aria-label={k === "del" ? "Delete last digit" : k}
                        className={cn(
                          "flex h-16 items-center justify-center rounded-2xl text-2xl font-bold tabular active:scale-95 disabled:opacity-50",
                          k === "del" ? "text-muted" : "bg-slate-100 text-navy-900 active:bg-slate-200",
                        )}
                      >
                        {k === "del" ? <Delete className="size-7" /> : k}
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}
          </D.Content>
        </D.Portal>
      </D.Root>
    </>
  );
}
