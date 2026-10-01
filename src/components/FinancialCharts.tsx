import { useId, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList,
  Line, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { formatINR } from "../utils/formatters";
import type { FlowBucket } from "../lib/chartData";

export const chartPalette = ["var(--chart-teal)", "var(--chart-amber)", "var(--chart-blue)", "var(--chart-violet)", "var(--chart-red)", "var(--chart-muted)"];
const tooltipStyle = {
  backgroundColor: "var(--chart-tooltip)", border: "1px solid var(--chart-grid)",
  borderRadius: 12, color: "var(--chart-ink)", boxShadow: "0 20px 44px rgba(0,0,0,.15)",
  fontSize: 12,
};
const axisTick = { fill: "var(--chart-axis)", fontSize: 10, fontFamily: "ui-monospace, monospace" };
const compact = (value: number) => formatINR(value, true);

export function CashTrendChart({ points }: { points: { date: string; balance: number }[] }) {
  const id = useId().replace(/:/g, "");
  if (!points.length) return <ChartEmpty label="Cash history will appear after the first bank sync." />;
  const first = points[0]?.balance ?? 0;
  const last = points.at(-1)?.balance ?? 0;
  const min = Math.min(...points.map(point => point.balance));
  const max = Math.max(...points.map(point => point.balance));
  const pad = Math.max((max - min) * 0.18, Math.abs(max) * .015, 1);
  return <div className="h-[194px] w-full min-w-0" role="img" aria-label={`Cash balance trend from ${points[0].date} to ${points.at(-1)?.date}, from ${formatINR(first)} to ${formatINR(last)}`}>
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 12, right: 8, left: -22, bottom: 0 }}>
        <defs><linearGradient id={`cash-fill-${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--chart-teal)" stopOpacity={0.34}/><stop offset="55%" stopColor="var(--chart-teal)" stopOpacity={0.08}/><stop offset="100%" stopColor="var(--chart-teal)" stopOpacity={0}/></linearGradient></defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="2 5" />
        <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} minTickGap={32} tickFormatter={value => String(value).slice(5)} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={compact} width={68} domain={[min - pad, max + pad]} tickCount={4}/>
        <ReferenceLine y={last} stroke="#8bd8c155" strokeDasharray="3 5"/>
        <Tooltip contentStyle={tooltipStyle} formatter={value => [formatINR(Number(value)), "Closing balance"]} labelFormatter={value => String(value)} cursor={{ stroke: "#d2f8ed77", strokeWidth: 1 }}/>
        <Area type="monotone" dataKey="balance" stroke="var(--chart-teal)" strokeWidth={2.6} fill={`url(#cash-fill-${id})`} dot={false} activeDot={{ r: 5, strokeWidth: 2, fill: "var(--chart-teal)", stroke: "var(--chart-tooltip)" }} isAnimationActive={false}/>
      </AreaChart>
    </ResponsiveContainer>
  </div>;
}

export function ChartEmpty({ label }: { label: string }) {
  return <div className="flex h-[180px] items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.025] px-5 text-center text-xs text-slate-500">{label}</div>;
}

export function SpendDonut({ items, totalLabel = "Total spend", compactView = false }: {
  items: { name: string; value: number }[]; totalLabel?: string; compactView?: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const positive = items.filter(item => item.value > 0);
  const sorted = [...positive].sort((a, b) => b.value - a.value);
  const visible = sorted.slice(0, compactView ? 4 : 5);
  const remainder = sorted.slice(visible.length).reduce((sum, item) => sum + item.value, 0);
  if (remainder) visible.push({ name: "Other", value: remainder });
  const total = positive.reduce((sum, item) => sum + item.value, 0);
  if (!total) return <ChartEmpty label="No spend in this selection." />;
  const active = activeIndex == null ? null : visible[activeIndex];
  return <div className={`grid items-center gap-4 ${compactView ? "sm:grid-cols-[154px_1fr]" : "md:grid-cols-[210px_1fr]"}`}>
    <div className={`relative mx-auto w-full ${compactView ? "h-[168px] max-w-[168px]" : "h-[220px] max-w-[220px]"}`} role="img" aria-label={`${totalLabel}: ${formatINR(total)} across ${visible.length} categories`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart><Pie data={[{ value: 1 }]} dataKey="value" innerRadius={compactView ? 73 : 96} outerRadius={compactView ? 75 : 98} fill="var(--chart-grid)" stroke="none" isAnimationActive={false} tooltipType="none" />
          <Pie data={visible} dataKey="value" nameKey="name" innerRadius={compactView ? 48 : 66} outerRadius={compactView ? 70 : 92} paddingAngle={2} cornerRadius={3} stroke="var(--chart-tooltip)" strokeWidth={2} isAnimationActive={false} onMouseEnter={(_, index) => setActiveIndex(index)} onMouseLeave={() => setActiveIndex(null)}>
          {visible.map((item, index) => <Cell key={item.name} fill={chartPalette[index % chartPalette.length]} fillOpacity={activeIndex === null || activeIndex === index ? 1 : .42}/>)}
        </Pie><Tooltip contentStyle={tooltipStyle} formatter={value => [formatINR(Number(value)), "Spend"]}/></PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-5 text-center"><span className="max-w-full truncate font-mono text-[9px] uppercase tracking-[0.13em] text-slate-400">{active?.name ?? totalLabel}</span><span className={`mt-1 font-mono font-semibold tabular-nums text-white ${compactView ? "text-sm" : "text-lg"}`}>{compact(active?.value ?? total)}</span><span className="mt-1 font-mono text-[10px] text-slate-500">{active ? `${(active.value / total * 100).toFixed(1)}% of total` : `${visible.length} groups`}</span></div>
    </div>
    <div className="min-w-0 space-y-2.5">{visible.map((item, index) => <button type="button" key={item.name} aria-label={`${item.name}: ${formatINR(item.value)}, ${(item.value / total * 100).toFixed(1)} percent of total`} className="group block w-full min-w-0 text-left focus-visible:rounded focus-visible:outline-2 focus-visible:outline-white" onMouseEnter={() => setActiveIndex(index)} onMouseLeave={() => setActiveIndex(null)} onFocus={() => setActiveIndex(index)} onBlur={() => setActiveIndex(null)}><div className="flex items-center justify-between gap-2 text-[11px]"><span className="flex min-w-0 items-center gap-2 text-slate-300"><span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: chartPalette[index % chartPalette.length] }}/><span className="truncate" title={item.name}>{item.name}</span></span><span className="shrink-0 font-mono tabular-nums text-slate-400">{Math.round(item.value / total * 100)}%</span></div><div className="ml-4 mt-1.5 h-[3px] overflow-hidden rounded-full bg-white/[.08]"><div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${item.value / total * 100}%`, backgroundColor: chartPalette[index % chartPalette.length] }}/></div></button>)}</div>
  </div>;
}

export function FlowBars({ data }: { data: FlowBucket[] }) {
  if (!data.length) return <ChartEmpty label="No non-transfer cash movement in this selection." />;
  const chartData = data.map(period => ({ ...period, net: period.moneyIn - period.moneyOut }));
  const id = useId().replace(/:/g, "");
  return <div className="h-[340px] w-full min-w-0" role="img" aria-label={`Money in, money out and net movement by period across ${data.length} periods`}>
    <ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartData} margin={{ top: 22, right: 14, left: -12, bottom: 0 }} barGap={3}>
      <defs><linearGradient id={`flow-in-${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--chart-teal-top)"/><stop offset="100%" stopColor="var(--chart-teal)"/></linearGradient><linearGradient id={`flow-out-${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--chart-amber-top)"/><stop offset="100%" stopColor="var(--chart-amber)"/></linearGradient></defs>
      <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="2 5"/>
      <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} minTickGap={6}/>
      <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={compact} width={76} domain={["auto", "auto"]}/>
      <ReferenceLine y={0} stroke="var(--chart-axis)"/>
      <Tooltip cursor={{ fill: "var(--chart-cursor)" }} contentStyle={tooltipStyle} formatter={(value, name) => [formatINR(Number(value)), name === "moneyIn" ? "Money in" : name === "moneyOut" ? "Money out" : "Net movement"]}/>
      <Bar dataKey="moneyIn" fill={`url(#flow-in-${id})`} maxBarSize={30} radius={[4,4,0,0]} isAnimationActive={false}/>
      <Bar dataKey="moneyOut" fill={`url(#flow-out-${id})`} maxBarSize={30} radius={[4,4,0,0]} isAnimationActive={false}/>
      <Line type="linear" dataKey="net" stroke="var(--chart-blue)" strokeWidth={2.2} dot={false} activeDot={{ r: 4, fill: "var(--chart-blue)", stroke: "var(--chart-tooltip)", strokeWidth: 2 }} isAnimationActive={false}/>
    </ComposedChart></ResponsiveContainer>
  </div>;
}

export function CategoryBars({ items }: { items: { name: string; value: number }[] }) {
  const positive = items.filter(item => item.value > 0).sort((a, b) => b.value - a.value);
  const total = positive.reduce((sum, item) => sum + item.value, 0);
  const data = positive.slice(0, 7).map(item => ({ ...item, short: item.name.length > 15 ? item.name.slice(0, 13) + "…" : item.name, share: `${Math.round(item.value / total * 100)}%` }));
  if (!data.length) return <ChartEmpty label="No debit categories in this selection." />;
  return <div className="h-[335px] w-full min-w-0" role="img" aria-label="Vertical bars comparing the highest debit categories, with share of total spend labels">
    <ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 26, right: 6, left: -12, bottom: 56 }}>
      <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="2 5"/>
      <XAxis dataKey="short" interval={0} angle={-28} textAnchor="end" height={58} tick={axisTick} tickLine={false} axisLine={false}/>
      <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={compact} width={76}/>
      <Tooltip cursor={{ fill: "var(--chart-cursor)" }} contentStyle={tooltipStyle} formatter={value => [formatINR(Number(value)), "Spend"]} labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ""}/>
      <Bar dataKey="value" maxBarSize={52} radius={[5,5,0,0]} isAnimationActive={false}>{data.map((item, index) => <Cell key={item.name} fill={chartPalette[index % chartPalette.length]}/>)}<LabelList dataKey="share" position="top" fill="var(--chart-ink)" fontSize={10} fontFamily="ui-monospace, monospace"/></Bar>
    </BarChart></ResponsiveContainer>
  </div>;
}

export function PatternBars({ items }: { items: { name: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...items.map(item => item.value));
  return <div className="space-y-5" role="img" aria-label={items.map(item => `${item.value} ${item.name}`).join(", ")}>
    {items.map(item => <div key={item.name} className="min-w-0"><div className="flex items-baseline justify-between gap-2"><span className="text-[11px] text-slate-300">{item.name}</span><strong className="font-mono text-xl font-semibold tabular-nums text-white">{item.value.toLocaleString("en-IN")}</strong></div><div className="relative mt-2 h-2 overflow-hidden rounded-sm bg-white/[.06]"><div className="h-full transition-[width] duration-500" style={{ width: `${item.value / max * 100}%`, background: `repeating-linear-gradient(90deg,${item.color} 0 7px,transparent 7px 10px)` }}/></div></div>)}
  </div>;
}
