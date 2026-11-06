"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Chart primitives for Analytics on the validated palette (dataviz skill, November 6, 2026): categorical hues in a
 * fixed order, status hues fixed per status, thin marks with 2px surface gaps, one axis, a legend for two or more
 * series. Every chart sits next to a table or direct numbers, which the palette's contrast relief requires.
 */
export const statusColors: Record<string, string> = { cold: "#2a78d6", warm: "#eda100", hot: "#e34948", client: "#1baf7a", lost: "#6250d6", disqualified: "#e87ba4" };
export const seriesColors = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
export const colorFor = (code: string, index: number) => statusColors[code] ?? seriesColors[index % seriesColors.length];

export type Series = { key: string; label: string; color: string };
type Row = Record<string, string | number>;
const axisTick = { fontSize: 10, fill: "#62697b" };
const tooltipStyle = { fontSize: 11, borderRadius: 8, border: "1px solid #e5e7ef", boxShadow: "0 6px 18px #26315b14" };
const payloadOf = (entry: unknown): Row => { const candidate = entry as { payload?: Row } | Row; return (candidate && typeof candidate === "object" && "payload" in candidate && candidate.payload ? candidate.payload : candidate) as Row; };

/** Stacked bars, vertical by default; `horizontal` lays the categories down the left for long labels. */
export function StackedBars({ data, xKey, series, height = 240, horizontal = false, onBarClick }: { data: Row[]; xKey: string; series: Series[]; height?: number; horizontal?: boolean; onBarClick?: (row: Row, key: string) => void }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 12, left: 4, bottom: 4 }} barCategoryGap="30%">
        <CartesianGrid stroke="#eef0f5" vertical={horizontal} horizontal={!horizontal} />
        {horizontal
          ? <><XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} /><YAxis type="category" dataKey={xKey} tick={axisTick} axisLine={false} tickLine={false} width={120} /></>
          : <><XAxis dataKey={xKey} tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" /><YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={32} /></>}
        <Tooltip cursor={{ fill: "#f4f5f9" }} contentStyle={tooltipStyle} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />}
        {series.map((item, index) => (
          <Bar
            key={item.key} dataKey={item.key} name={item.label} stackId="stack" fill={item.color} stroke="#fff" strokeWidth={2} maxBarSize={28}
            radius={index === series.length - 1 ? (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]) : 0}
            cursor={onBarClick ? "pointer" : undefined}
            onClick={onBarClick ? (entry: unknown) => onBarClick(payloadOf(entry), item.key) : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** One series of bars whose colour follows the category (a status, a reason), horizontal for readable labels. */
export function CategoryBars({ data, labelKey, valueKey, valueLabel, colorOf, height, onBarClick }: { data: Row[]; labelKey: string; valueKey: string; valueLabel: string; colorOf: (row: Row, index: number) => string; height?: number; onBarClick?: (row: Row) => void }) {
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(120, 28 * data.length + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 4, bottom: 4 }} barCategoryGap="30%">
        <CartesianGrid stroke="#eef0f5" horizontal={false} />
        <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey={labelKey} tick={axisTick} axisLine={false} tickLine={false} width={130} />
        <Tooltip cursor={{ fill: "#f4f5f9" }} contentStyle={tooltipStyle} />
        <Bar dataKey={valueKey} name={valueLabel} radius={[0, 4, 4, 0]} maxBarSize={22} cursor={onBarClick ? "pointer" : undefined} onClick={onBarClick ? (entry: unknown) => onBarClick(payloadOf(entry)) : undefined} label={{ position: "right", fontSize: 10, fill: "#62697b" }}>
          {data.map((row, index) => <Cell key={String(row[labelKey])} fill={colorOf(row, index)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
