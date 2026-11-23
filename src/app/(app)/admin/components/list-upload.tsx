"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { ListChange } from "@/lib/production-list";
import { applyProductionList, previewProductionList, type ListPreview } from "./list-actions";

export function ListUpload() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [hideOthers, setHideOthers] = useState(true);
  const [preview, setPreview] = useState<ListPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, startCheck] = useTransition();
  const [applying, startApply] = useTransition();

  const check = () =>
    startCheck(async () => {
      setError(null);
      setPreview(null);
      const file = fileRef.current?.files?.[0];
      if (!file) return setError("Choose the Excel file (.xlsx) first.");
      const fd = new FormData();
      fd.set("file", file);
      fd.set("hideOthers", String(hideOthers));
      try {
        const res = await previewProductionList(fd);
        if (res.ok && res.data) setPreview(res.data);
        else if (!res.ok) setError(res.error);
      } catch {
        setError("Upload failed — check the connection and try again.");
      }
    });

  const apply = () =>
    startApply(async () => {
      if (!preview) return;
      const res = await applyProductionList({ items: preview.records, hideOthers: preview.hideOthers });
      if (res.ok) {
        toast.success(res.message ?? "Component list updated");
        setPreview(null);
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } else toast.error(res.error);
    });

  const errors = preview?.issues.filter((i) => i.severity === "error") ?? [];
  const warnings = preview?.issues.filter((i) => i.severity !== "error") ?? [];
  const d = preview?.diff;
  const nothingToDo = d && !d.added.length && !d.updated.length && !d.reactivated.length && !d.hidden.length;

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="size-5 text-brand" /> Production component list (Excel)</CardTitle>
        <CardDescription>
          Keep the list in Excel: download it, edit it, upload it here. Columns: <strong>Production Part Name</strong> and{" "}
          <strong>RAW MATERIAL</strong> (other columns are ignored). You see every change before anything is saved.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="outline">
            <a href="/api/components/list"><Download /> Download current list</a>
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-label="Production list Excel file"
            className="max-w-full text-sm file:mr-3 file:h-11 file:rounded-lg file:border-0 file:bg-navy-900 file:px-4 file:font-semibold file:text-white"
            onChange={() => { setPreview(null); setError(null); }}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-5" checked={hideOthers} onChange={(e) => { setHideOthers(e.target.checked); setPreview(null); }} />
            Hide parts that are not in the file
          </label>
          <Button onClick={check} disabled={checking}>
            {checking ? <Loader2 className="animate-spin" /> : <Upload />} Check file
          </Button>
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        {preview && d && (
          <div className="space-y-3 rounded-lg border border-line p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-navy-900">{preview.fileName}</span>
              <span className="text-sm text-muted">· {preview.records.length} parts</span>
              <Badge variant="success">{d.added.length} new</Badge>
              <Badge variant="brand">{d.updated.length} changed</Badge>
              <Badge variant="brand">{d.reactivated.length} re-activated</Badge>
              <Badge variant={d.hidden.length ? "warning" : "default"}>{d.hidden.length} hidden</Badge>
              <Badge>{d.unchanged} unchanged</Badge>
            </div>

            {errors.length > 0 && (
              <Alert variant="error" title="Fix these rows in Excel and upload again">
                <ul className="list-disc pl-4">{errors.map((i, n) => <li key={n}>Row {i.line}: {i.message}</li>)}</ul>
              </Alert>
            )}
            {warnings.length > 0 && (
              <Alert variant="warning" title="Please check">
                <ul className="list-disc pl-4">{warnings.map((i, n) => <li key={n}>{i.line ? `Row ${i.line}: ` : ""}{i.message}</li>)}</ul>
              </Alert>
            )}

            <ChangeList title="New parts" items={d.added} />
            <ChangeList title="Changed" items={d.updated} showPrevious />
            <ChangeList title="Re-activated" items={d.reactivated} />
            <ChangeList title="Will be hidden from operators (kept for history)" items={d.hidden} tone="warning" />
            {nothingToDo && <Alert variant="success">The app already matches this file — nothing to change.</Alert>}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="success" onClick={apply} disabled={applying || errors.length > 0 || Boolean(nothingToDo)}>
                {applying && <Loader2 className="animate-spin" />} Apply changes
              </Button>
              <Button variant="ghost" onClick={() => setPreview(null)} disabled={applying}><X /> Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChangeList({ title, items, showPrevious, tone }: { title: string; items: ListChange[]; showPrevious?: boolean; tone?: "warning" }) {
  if (!items.length) return null;
  return (
    <details open={items.length <= 30} className="text-sm">
      <summary className={`cursor-pointer font-semibold ${tone === "warning" ? "text-warning" : "text-navy-900"}`}>
        {title} ({items.length})
      </summary>
      <ul className="mt-1 grid gap-x-6 gap-y-0.5 pl-4 sm:grid-cols-2">
        {items.map((c) => (
          <li key={c.name} className="list-disc">
            {showPrevious && c.previousName && c.previousName !== c.name ? <><span className="text-muted line-through">{c.previousName}</span> → </> : null}
            {c.name}
            <span className="text-muted">
              {" · "}
              {showPrevious && c.previousRawMaterial !== c.rawMaterial ? <><span className="line-through">{c.previousRawMaterial ?? "no material"}</span> → </> : null}
              {c.rawMaterial ?? "no material"}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
