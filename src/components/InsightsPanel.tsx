/* Repository touch marker. */
import { displayText } from "../../shared/branding.ts";
import type { AnalyticsSummary } from "../types/finance";
import { formatDateIndian, formatINR } from "../utils/formatters";
import { CashTrendChart, PatternBars, SpendDonut } from "./FinancialCharts";
import { HeroBipartiteHeader } from "./HeroBipartiteHeader";
import { useEffect, useMemo, useState } from "react";
import type { Transaction } from "../types/finance.ts";
import { spendMix, type SpendPeriod } from "../../shared/memory.ts";

const card = "min-w-0 rounded-2xl border border-white/[0.12] bg-[linear-gradient(155deg,#171e23_0%,#0b1014_72%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_16px_34px_rgba(0,0,0,.2)] sm:p-6";
const label = "font-mono text-[10px] uppercase tracking-[0.22em] text-slate-400";

function FlowRail({ title, value, max, color }: { title: string; value: number; max: number; color: string }) {
  const width = max > 0 ? Math.max(2, value / max * 100) : 0;
  return <div className="min-w-0">
    <div className="flex items-baseline justify-between gap-3"><span className="text-xs text-slate-300">{title}</span><strong className="font-mono text-sm font-semibold tabular-nums text-white">{formatINR(value, true)}</strong></div>
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" role="meter" aria-label={title} aria-valuemin={0} aria-valuemax={Math.max(1, max)} aria-valuenow={value}>
      <div className="h-full rounded-full" style={{ width: `${width}%`, background: `linear-gradient(90deg, ${color}70, ${color})`, boxShadow: `0 0 12px ${color}55` }}/>
    </div>
  </div>;
}

export function InsightsPanel({ analytics: a, insights, transactions, asOf, defaultPeriod = "monthly" }: { analytics: AnalyticsSummary; insights: string[]; transactions: Transaction[]; asOf: string | null; defaultPeriod?: SpendPeriod }) {
  const [period, setPeriod] = useState<SpendPeriod>(defaultPeriod);
  useEffect(() => setPeriod(defaultPeriod), [defaultPeriod]);
  const mix = useMemo(() => asOf ? spendMix(transactions, asOf, period) : null, [transactions, asOf, period]);
  const timeline = a.cashTimeline ?? [];
  const categories = mix?.items ?? [];
  const patterns = [
    { name: "Internal transfers", value: a.transferCount ?? 0, color: "#91b9ee" },
    { name: "Recurring lines", value: a.recurringCount ?? 0, color: "#8bd8c1" },
    { name: "Possible duplicates", value: a.duplicateCount ?? 0, color: "#edbc74" },
  ];
  const latest = timeline.at(-1);
  const previous = timeline.length > 1 ? timeline[timeline.length - 2] : null;
  const change = latest && previous ? latest.balance - previous.balance : 0;
  const review = (a.reviewTrend ?? []).slice(-7);
  const reviewMax = Math.max(1, ...review.map(item => item.count));
  const flowMax = Math.max(a.inflowThisMonth, a.outflowThisMonth, 1);

  return <section className="border-b border-white/10 bg-[#070b0f] px-4 pb-7 pt-5 sm:px-6" aria-labelledby="overview-title">
    <div className="mx-auto max-w-[1600px]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><p className={label}>Statement intelligence / overview</p><h2 id="overview-title" className="ledger-display mt-1 text-2xl font-semibold tracking-tight text-white sm:text-[1.9rem]">At a glance</h2></div>
        <p className="font-mono text-[11px] text-slate-500">{timeline.length ? `${formatDateIndian(timeline[0].date)} — ${formatDateIndian(timeline.at(-1)!.date)}` : "Awaiting bank data"}</p>
      </div>

      <div className="mb-4 overflow-hidden rounded-2xl border border-white/20 bg-black shadow-[0_18px_35px_rgba(0,0,0,.22)]">
        <div className="theme-artwork"><HeroBipartiteHeader cashPositionStr={formatINR(a.cashPosition)} /></div>
        <div className="grid gap-3 border-t border-white/15 bg-[#11171c] px-5 py-3 sm:grid-cols-2 sm:gap-7 sm:px-7">
          <FlowRail title="Latest month in" value={a.inflowThisMonth} max={flowMax} color="#8bd8c1" />
          <FlowRail title="Latest month out" value={a.outflowThisMonth} max={flowMax} color="#edbc74" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <article className={`${card} lg:col-span-5`}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className={label}>Cash movement</p><h3 className="ledger-display mt-1 text-lg font-semibold text-white">Balance over time</h3></div><span className={`rounded-md border px-2 py-1 font-mono text-[10px] ${change >= 0 ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200" : "border-rose-300/25 bg-rose-300/10 text-rose-200"}`}>{change >= 0 ? "+" : ""}{formatINR(change, true)} last move</span></div>
          <div className="mt-3"><CashTrendChart points={timeline}/></div>
          <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-3 text-[11px] text-slate-400"><span>Opening {formatINR(timeline[0]?.balance ?? 0, true)}</span><span className="text-emerald-200">Latest {formatINR(latest?.balance ?? 0, true)}</span></div>
        </article>

        <article className={`${card} lg:col-span-4`}>
          <div className="spend-mix-heading"><div><p className={label}>Spend mix</p><h3 className="ledger-display mt-1 text-lg font-semibold text-white">{period === "weekly" ? "Last 7 days" : period === "yearly" ? "Year to date" : "Month to date"} by category</h3></div><label className="spend-period-label"><span className="sr-only">Spend Mix period</span><select aria-label="Spend Mix period" value={period} onChange={e => setPeriod(e.target.value as SpendPeriod)}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label></div>
          <div className="mt-2"><SpendDonut items={categories} totalLabel="Category spend" compactView/></div>
          <p className="mt-3 border-t border-white/10 pt-3 text-[11px] text-slate-500">{mix ? `${formatDateIndian(mix.start)} – ${formatDateIndian(mix.end)}` : "Awaiting bank data"} · Expenses only, excluding internal transfers</p>
        </article>

        <article className={`${card} lg:col-span-3`}>
          <div><p className={label}>Pattern signals</p><h3 className="ledger-display mt-1 text-lg font-semibold text-white">Lines to understand</h3></div>
          <div className="mt-5"><PatternBars items={patterns}/></div>
          <p className="mt-5 border-t border-white/10 pt-3 text-[11px] leading-relaxed text-slate-500">Counts identify patterns for review, not money stopped or recovered.</p>
        </article>
      </div>

      <details className="group mt-4 rounded-xl border border-white/10 bg-white/[0.025] px-5 py-3 text-xs text-slate-300">
        <summary className="cursor-pointer select-none font-medium text-slate-300 transition-colors hover:text-white">Explore counterparties, review activity & subscription insights</summary>
        <div className="mt-5 grid gap-6 border-t border-white/10 pt-5 md:grid-cols-2">
          <div><p className={label}>Top counterparties</p><div className="mt-3 space-y-2">{(a.topCounterparties ?? []).slice(0, 6).map(p => <div key={displayText(p.name)} className="flex justify-between gap-3 border-b border-white/5 pb-2"><span className="truncate">{displayText(p.name)}</span><span className="shrink-0 font-mono text-slate-400">{formatINR(p.amount, true)}</span></div>)}{!a.topCounterparties?.length && <p className="text-slate-500">No counterparty data yet.</p>}</div></div>
          <div><p className={label}>Review activity · recent dates</p><div className="mt-3 flex h-28 items-end gap-2 border-b border-white/10">{review.map(p => <div key={p.date} className="group/bar flex min-w-0 flex-1 flex-col items-center gap-1" title={`${formatDateIndian(p.date)} · ${p.count} unresolved`}><span className="font-mono text-[10px] text-slate-400">{p.count}</span><div className="w-full max-w-10 rounded-t bg-amber-300/75" style={{ height: `${Math.max(5, p.count / reviewMax * 75)}px` }}/></div>)}</div><div className="mt-3 space-y-1">{insights.map(item => <p key={item} className="text-amber-200">{displayText(item)}</p>)}{!insights.length && <p className="text-slate-500">No two-cycle subscription gaps identified in covered history.</p>}</div></div>
        </div>
      </details>
    </div>
  </section>;
}
