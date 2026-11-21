"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Bucket } from "@/lib/aggregate";
import { formatQty } from "@/lib/utils";

// Single-series charts: one brand hue (validated: contrast ≥ 3:1 on white), no legend needed.
const SERIES = "#2563eb";
const GRID = "#e2e8f0";
const AXIS = "#64748b";

function TooltipBox({ active, payload, label }: { active?: boolean; payload?: { value: number; payload: Bucket }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const b = payload[0]!.payload;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-navy-900">{b.label ?? label}</p>
      <p className="text-ink tabular">{formatQty(b.quantity)} pcs</p>
      <p className="text-muted tabular">{b.entries} entr{b.entries === 1 ? "y" : "ies"}</p>
    </div>
  );
}

export function QuantityBarChart({ data, height = 240, xKey = "label" }: { data: Bucket[]; height?: number; xKey?: "label" | "key" }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => formatQty(v)} allowDecimals={false} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: "rgba(37,99,235,0.08)" }} />
        <Bar dataKey="quantity" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HorizontalBarChart({ data, height }: { data: Bucket[]; height?: number }) {
  const h = height ?? Math.max(160, data.length * 32 + 24);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap="25%">
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatQty(v)} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={150}
          tick={{ fontSize: 11, fill: "#334155" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) => (v.length > 24 ? `${v.slice(0, 23)}…` : v)}
        />
        <Tooltip content={<TooltipBox />} cursor={{ fill: "rgba(37,99,235,0.08)" }} />
        <Bar dataKey="quantity" fill={SERIES} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendLineChart({ data, height = 220 }: { data: Bucket[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={(v: string) => v.slice(5)} />
        <YAxis tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => formatQty(v)} allowDecimals={false} />
        <Tooltip content={<TooltipBox />} cursor={{ stroke: AXIS, strokeDasharray: "3 3" }} />
        <Line type="monotone" dataKey="quantity" stroke={SERIES} strokeWidth={2} dot={{ r: 4, fill: SERIES, stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
