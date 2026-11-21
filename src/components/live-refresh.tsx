"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Radio } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to production changes via Supabase Realtime (RLS-filtered) and
 * refreshes server data, throttled to once every 5 s.
 */
export function LiveRefresh({ tables = ["production_entries"] }: { tables?: string[] }) {
  const router = useRouter();
  const [live, setLive] = useState(false);
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = tables.join(",");

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      const wait = Math.max(0, 5000 - (Date.now() - last.current));
      if (timer.current) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        last.current = Date.now();
        router.refresh();
      }, wait);
    };
    let channel = supabase.channel(`live-${key}`);
    for (const t of key.split(",")) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table: t }, refresh);
    }
    channel.subscribe((status: string) => setLive(status === "SUBSCRIBED"));
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [router, key]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted" title={live ? "Updates automatically" : "Live updates unavailable — refresh to update"}>
      <Radio className={live ? "size-3.5 text-success" : "size-3.5 text-slate-400"} />
      {live ? "Live" : "Not live"}
    </span>
  );
}
