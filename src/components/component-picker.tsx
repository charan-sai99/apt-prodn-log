"use client";
import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface PickerComponent {
  id: string;
  component_name: string;
  component_code: string | null;
}

function normalise(s: string) {
  return s.toLowerCase().replace(/[\s\-_/().]+/g, "");
}

/** Searchable component chooser: full-height sheet on phones. */
export function ComponentPicker({
  components,
  value,
  onChange,
  recentIds = [],
  invalid,
  id,
  placeholder = "Choose component",
}: {
  components: PickerComponent[];
  value: string | null | undefined;
  onChange: (id: string) => void;
  recentIds?: string[];
  invalid?: boolean;
  id?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = components.find((c) => c.id === value);

  const results = useMemo(() => {
    const q = normalise(query);
    if (!q) return components;
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return components.filter((c) => {
      const hay = `${c.component_name} ${c.component_code ?? ""}`.toLowerCase();
      return normalise(hay).includes(q) || words.every((w) => hay.includes(w));
    });
  }, [components, query]);

  const recent = useMemo(
    () => recentIds.map((rid) => components.find((c) => c.id === rid)).filter(Boolean) as PickerComponent[],
    [recentIds, components],
  );

  const choose = (cid: string) => {
    onChange(cid);
    setOpen(false);
    setQuery("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        id={id}
        aria-invalid={invalid || undefined}
        className={cn(
          "flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border bg-surface px-4 py-3 text-left",
          invalid ? "border-danger" : "border-line",
        )}
      >
        {selected ? (
          <span className="min-w-0">
            <span className="block truncate font-semibold text-navy-900">{selected.component_name}</span>
            {selected.component_code && <span className="block truncate text-xs text-muted">{selected.component_code}</span>}
          </span>
        ) : (
          <span className="text-slate-400">{placeholder}</span>
        )}
        <ChevronDown className="size-5 shrink-0 text-muted" />
      </DialogTrigger>
      <DialogContent title="Choose component" className="sm:max-w-xl" description={`${components.length} active components`}>
        <div className="sticky -top-4 z-10 -mx-4 -mt-4 bg-surface px-4 pb-3 pt-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or part code"
              className="h-12 pl-10"
              aria-label="Search components"
              type="search"
              enterKeyHint="search"
            />
          </div>
        </div>
        {!query && recent.length > 0 && (
          <div className="mb-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Used today</p>
            <ul className="space-y-1">
              {recent.map((c) => (
                <Option key={`r-${c.id}`} c={c} selected={c.id === value} onPick={choose} />
              ))}
            </ul>
            <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-muted">All components</p>
          </div>
        )}
        <ul className="space-y-1" role="listbox" aria-label="Components">
          {results.slice(0, 200).map((c) => (
            <Option key={c.id} c={c} selected={c.id === value} onPick={choose} />
          ))}
        </ul>
        {results.length === 0 && <p className="py-8 text-center text-sm text-muted">No component matches “{query}”.</p>}
        {results.length > 200 && <p className="py-3 text-center text-xs text-muted">Showing 200 of {results.length}. Keep typing to narrow down.</p>}
      </DialogContent>
    </Dialog>
  );
}

function Option({ c, selected, onPick }: { c: PickerComponent; selected: boolean; onPick: (id: string) => void }) {
  return (
    <li role="option" aria-selected={selected}>
      <button
        type="button"
        onClick={() => onPick(c.id)}
        className={cn(
          "flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left",
          selected ? "bg-brand-50" : "hover:bg-slate-50 active:bg-slate-100",
        )}
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-navy-900">{c.component_name}</span>
          {c.component_code && <span className="block text-xs text-muted">{c.component_code}</span>}
        </span>
        {selected && <Check className="size-5 shrink-0 text-brand" />}
      </button>
    </li>
  );
}
