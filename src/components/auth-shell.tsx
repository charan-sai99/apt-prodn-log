import { Brand } from "@/components/brand";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col bg-navy-900 pt-safe">
      <div className="relative overflow-hidden px-6 pb-10 pt-10">
        <div className="pointer-events-none absolute -right-16 -top-16 size-64 rotate-12 rounded-3xl bg-brand/20" aria-hidden />
        <div className="pointer-events-none absolute -right-4 top-20 h-1.5 w-40 -rotate-6 rounded-full bg-brand" aria-hidden />
        <Brand inverted />
      </div>
      <div className="flex-1 rounded-t-3xl bg-canvas px-5 pb-10 pt-8 sm:flex sm:items-start sm:justify-center">
        <div className="mx-auto w-full max-w-sm space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-navy-900">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
