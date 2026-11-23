/** Shown instantly while a page loads, so a tap always gives visible feedback. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="animate-pulse space-y-4">
      <span className="sr-only">Loading…</span>
      <div className="h-7 w-48 rounded-lg bg-slate-200" />
      <div className="h-4 w-64 rounded bg-slate-200" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-[var(--radius-card)] bg-slate-200" />
        ))}
      </div>
      <div className="h-64 rounded-[var(--radius-card)] bg-slate-200" />
    </div>
  );
}
