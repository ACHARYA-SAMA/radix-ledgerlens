/* Repository touch marker. */
import { displayText } from "../../shared/branding.ts";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  Download,
  Layers3,
  RefreshCw,
  ShieldAlert,
  X,
} from "lucide-react";
import type {
  AnalyticsSummary,
  BankAccountSummary,
  BeneficiaryChange,
  SubscriptionSummary,
  Transaction,
} from "../types/finance";
import { CategoryBars, FlowBars, SpendDonut } from "./FinancialCharts";
import { cashFlowBuckets } from "../lib/chartData";
import { formatDateIndian, formatINR } from "../utils/formatters";
import { sound } from "../utils/audioSynthesizer";
import {
  calendarDays,
  accountClosingPaise,
  dateOnly,
  duplicateGroups,
  filterTransactions,
  isRecurring,
  isTransfer,
  paise,
  shiftDays,
  signedPaise,
  spendingGroups,
  summarize,
  utcDate,
} from "../lib/analyticsMath";

interface Props {
  cfo?: import("../../shared/voiceCfo.ts").CfoResult | null;
  transactions: Transaction[];
  bankAccounts: BankAccountSummary[];
  subscriptions: SubscriptionSummary[];
  beneficiaryChanges: BeneficiaryChange[];
  analytics: AnalyticsSummary;
  onSelectTransactionForTrace: (tx: Transaction) => void;
}

const money = (amountPaise: number) => formatINR(amountPaise / 100);
const panel = "rounded-2xl border border-white/[0.13] bg-[linear-gradient(155deg,#171e23_0%,#0b1014_76%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_18px_35px_rgba(0,0,0,.22)] sm:p-6";
const smallLabel =
  "font-mono text-[10px] uppercase tracking-[0.22em] text-slate-400";
const glow =
  "bg-gradient-to-r from-white via-slate-200 to-slate-500 bg-clip-text text-transparent";
const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

function MetricCard({
  icon,
  label,
  value,
  detail,
  foot,
  accent,
  ratio,
  scaleLabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  foot?: string;
  accent: string;
  ratio: number;
  scaleLabel: string;
}) {
  const percent = Math.max(0, Math.min(100, ratio * 100));
  const activeSegments = percent > 0 ? Math.max(1, Math.round(percent / 100 * 20)) : 0;
  return (
    <article className="group relative flex min-h-[190px] flex-col overflow-hidden rounded-2xl border border-white/[0.13] bg-[linear-gradient(155deg,#1a2227_0%,#0b1115_75%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.1),0_14px_30px_rgba(0,0,0,.25)] transition-colors hover:border-white/30" style={{ borderTopColor: `color-mix(in srgb, ${accent} 55%, transparent)` }}>
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</span>
        <span className="rounded-md border p-1.5" style={{ borderColor: `color-mix(in srgb, ${accent} 35%, transparent)`, backgroundColor: `color-mix(in srgb, ${accent} 9%, transparent)`, color: accent }}>{icon}</span>
      </div>
      <strong className="ledger-display mt-3 text-[clamp(1.4rem,2vw,2rem)] font-semibold leading-tight tracking-tight tabular-nums text-white">{value}</strong>
      <p className="mt-1 text-xs text-slate-400">{detail}</p>
      <div className="mt-auto pt-4">
        <div className="grid grid-cols-20 gap-[3px]" role="meter" aria-label={`${label}: ${scaleLabel}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
          {Array.from({ length: 20 }, (_, index) => <span key={index} className="h-2 rounded-[2px]" style={{ backgroundColor: index < activeSegments ? accent : 'var(--chart-grid)', boxShadow: index < activeSegments ? `0 0 9px color-mix(in srgb, ${accent} 20%, transparent)` : undefined }}/>) }
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-2 font-mono text-[10px]"><span className="text-slate-500">{scaleLabel}</span><span className="tabular-nums" style={{ color: accent }}>{percent.toFixed(1)}%</span></div>
        {foot && <p className="mt-2 border-t border-white/[.08] pt-2 text-[10px] leading-snug text-slate-500">{foot}</p>}
      </div>
    </article>
  );
}

const heatClass = (count: number) => `activity-heat activity-heat-${count >= 8 ? 4 : count >= 5 ? 3 : count >= 3 ? 2 : count >= 1 ? 1 : 0}`;

function dateRangeLabel(start: string, end: string) {
  if (!start || !end) return "No statement dates";
  return `${formatDateIndian(start)} — ${formatDateIndian(end)}`;
}

function expenseRows(rows: Transaction[]) {
  return rows.filter(
    (tx) =>
      signedPaise(tx) < 0 &&
      !isTransfer(tx) &&
      !["salary_payment", "tax_payment", "loan_repayment", "personal"].includes(
        tx.categoryId ?? "",
      ),
  );
}

function subscriptionMatches(sub: SubscriptionSummary, rows: Transaction[]) {
  const tokens = normalize(sub.vendorName)
    .split(" ")
    .filter(
      (part) =>
        part.length >= 3 && !["and", "pvt", "ltd", "llp", "the"].includes(part),
    );
  if (tokens.length < 2) return [];
  return rows.filter((tx) => {
    if (signedPaise(tx) >= 0 || isTransfer(tx)) return false;
    const party = normalize(
      `${tx.vendorClientName} ${tx.counterpartyText ?? ""} ${tx.rawNarration}`,
    );
    return tokens.slice(0, 2).every((token) => party.includes(token));
  });
}

function expectedRenewalInRange(
  sub: SubscriptionSummary,
  start: string,
  end: string,
) {
  if (
    !sub.renewalDate ||
    !start ||
    !end ||
    !["monthly", "quarterly", "annual"].includes(sub.billingCycle)
  )
    return null;
  const date = utcDate(sub.renewalDate);
  if (!Number.isFinite(date.getTime())) return null;
  const months =
    sub.billingCycle === "annual"
      ? 12
      : sub.billingCycle === "quarterly"
        ? 3
        : 1;
  for (let i = 0; i < 30 && dateOnly(date) > end; i++)
    date.setUTCMonth(date.getUTCMonth() - months);
  return dateOnly(date) >= start && dateOnly(date) <= end
    ? dateOnly(date)
    : null;
}

export function AnalyticsView({
  cfo,
  transactions,
  bankAccounts,
  subscriptions,
  beneficiaryChanges,
  analytics,
  onSelectTransactionForTrace,
}: Props) {
  const dates = useMemo(
    () => transactions.map((tx) => tx.date).sort(),
    [transactions],
  );
  const first = dates[0] ?? "";
  const last = dates.at(-1) ?? "";
  const [start, setStart] = useState(first);
  const [end, setEnd] = useState(last);
  const [bankId, setBankId] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [preset, setPreset] = useState("All Dates");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    if (!first || !last) return;
    if (["All Dates", "Last 7 Days", "Last 14 Days", "This Month"].includes(preset)) {
      const next = preset === "Last 7 Days" ? shiftDays(last, -6) : preset === "Last 14 Days" ? shiftDays(last, -13) : preset === "This Month" ? `${last.slice(0, 7)}-01` : first;
      setStart(next < first ? first : next);
      setEnd(last);
    } else {
      setStart(value => value || first);
      setEnd(value => value || last);
    }
  }, [first, last, preset]);
  useEffect(() => {
    if (selectedDate && (selectedDate < start || selectedDate > end))
      setSelectedDate(null);
  }, [selectedDate, start, end]);

  const choosePreset = (choice: string) => {
    if (!last) return;
    let nextStart = first;
    if (choice === "Last 7 Days") nextStart = shiftDays(last, -6);
    if (choice === "Last 14 Days") nextStart = shiftDays(last, -13);
    if (choice === "This Month") nextStart = `${last.slice(0, 7)}-01`;
    setStart(nextStart < first ? first : nextStart);
    setEnd(last);
    setSelectedDate(null);
    setPreset(choice);
    sound.playPluck(0.45, 0.2);
  };
  useEffect(() => { if(cfo?.ledgerFilter) {setBankId("");setSelectedDate(null);setPreset("This Month");} }, [cfo?.id]);
  const rangeRows = useMemo(
    () => filterTransactions(cfo?.ledgerFilter ? transactions.filter(t => cfo.ledgerFilter!.ids.includes(t.id)) : transactions, { start, end, bankId }),
    [transactions, start, end, bankId, cfo],
  );
  const activeRows = useMemo(
    () =>
      selectedDate
        ? rangeRows.filter((tx) => tx.date === selectedDate)
        : rangeRows,
    [rangeRows, selectedDate],
  );
  const totals = useMemo(() => summarize(activeRows), [activeRows]);
  const expense = useMemo(() => spendingGroups(activeRows), [activeRows]);
  const flow = useMemo(
    () => cashFlowBuckets(activeRows, selectedDate ?? start, selectedDate ?? end),
    [activeRows, selectedDate, start, end],
  );
  const operational = useMemo(() => expenseRows(activeRows), [activeRows]);
  const duplicateIds = useMemo(
    () =>
      new Set(
        duplicateGroups(transactions).flatMap((group) =>
          group.map((tx) => tx.id),
        ),
      ),
    [transactions],
  );
  const alerts = beneficiaryChanges.filter((alert) => {
    if (
      alert.transactionIds?.some((id) => activeRows.some((tx) => tx.id === id))
    )
      return true;
    return (
      !bankId &&
      alert.changeDate.slice(0, 10) >= (selectedDate ?? start) &&
      alert.changeDate.slice(0, 10) <= (selectedDate ?? end)
    );
  });
  const activeSubscriptionRows = subscriptions.filter(
    (sub) =>
      subscriptionMatches(sub, activeRows).length > 0 ||
      (!bankId &&
        !!expectedRenewalInRange(
          sub,
          selectedDate ?? start,
          selectedDate ?? end,
        )),
  );
  const subscriptionIds = new Set(
    subscriptions.flatMap((sub) =>
      subscriptionMatches(sub, activeRows).map((tx) => tx.id),
    ),
  );
  const recurringRows = activeRows.filter(
    (tx) =>
      signedPaise(tx) < 0 && (isRecurring(tx) || subscriptionIds.has(tx.id)),
  );
  const recurringPaise = recurringRows.reduce(
    (sum, tx) => sum + Math.abs(signedPaise(tx)),
    0,
  );
  const recurringOperationalPaise = operational
    .filter((tx) => isRecurring(tx) || subscriptionIds.has(tx.id))
    .reduce((sum, tx) => sum + Math.abs(signedPaise(tx)), 0);
  const oneOffOperationalPaise = operational
    .filter((tx) => !isRecurring(tx) && !subscriptionIds.has(tx.id))
    .reduce((sum, tx) => sum + Math.abs(signedPaise(tx)), 0);
  const unlinkedRecurring = activeRows.filter(
    (tx) =>
      signedPaise(tx) < 0 && isRecurring(tx) && !subscriptionIds.has(tx.id),
  ).length;
  const unlinkedVendors = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const tx of activeRows) {
      if (
        signedPaise(tx) >= 0 ||
        !isRecurring(tx) ||
        subscriptionIds.has(tx.id)
      )
        continue;
      const name =
        tx.vendorClientName || tx.counterpartyText || "Unresolved vendor";
      map.set(name, [...(map.get(name) ?? []), tx]);
    }
    return [...map]
      .map(([name, rows]) => ({
        name,
        count: rows.length,
        amountPaise: rows.reduce((n, tx) => n + Math.abs(signedPaise(tx)), 0),
      }))
      .sort((a, b) => b.amountPaise - a.amountPaise);
  }, [activeRows, subscriptionIds]);
  const days = useMemo(() => calendarDays(start, end), [start, end]);
  const weeks = Array.from({ length: Math.ceil(days.length / 7) }, (_, i) =>
    days.slice(i * 7, i * 7 + 7),
  );
  const byDay = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const tx of rangeRows)
      map.set(tx.date, [...(map.get(tx.date) ?? []), tx]);
    return map;
  }, [rangeRows]);
  const inRangeDays = days.filter((day) => day >= start && day <= end);
  const activeDayCount = inRangeDays.filter((day) => (byDay.get(day)?.length ?? 0) > 0).length;
  const maxDayCount = Math.max(1, ...inRangeDays.map((day) => byDay.get(day)?.length ?? 0));
  const busiestDay = inRangeDays.reduce((best, day) => (byDay.get(day)?.length ?? 0) > (byDay.get(best)?.length ?? 0) ? day : best, inRangeDays[0] ?? "");
  const weekdayProfile = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, index) => ({
    label,
    count: inRangeDays.reduce((sum, day) => sum + (((utcDate(day).getUTCDay() + 6) % 7) === index ? (byDay.get(day)?.length ?? 0) : 0), 0),
  }));
  const maxWeekday = Math.max(1, ...weekdayProfile.map((day) => day.count));
  const bankCards = bankAccounts.filter(
    (account) => !bankId || account.id === bankId,
  );
  const totalExpense = expense.reduce((n, item) => n + item.amountPaise, 0);
  const grossFlow = totals.moneyInPaise + totals.moneyOutPaise;
  const allMovement = grossFlow + totals.transferPaise;
  const share = (value: number, total: number) => total > 0 ? value / total : 0;
  const downloadPdf = async () => {
    if (!start || !end || start > end || exporting) return;
    setExporting(true);
    setExportError("");
    try {
      const { buildAnalyticsPdf } = await import("../lib/analyticsPdf");
      const account = bankAccounts.find(item => item.id === bankId);
      const report = buildAnalyticsPdf({
        rows: rangeRows,
        allRows: transactions,
        start,
        end,
        bankLabel: account ? `${displayText(account.bank)} ${account.accountLast4}` : "All banks",
        bankAccounts,
        subscriptions,
        beneficiaryChanges,
      });
      report.save(`LedgerLens-Analytics-${start}-to-${end}${account ? `-${account.accountLast4}` : ""}.pdf`);
    } catch (error) {
      console.error("[Analytics PDF] Export failed", error);
      setExportError("Could not create the PDF. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b0f] px-4 pb-20 pt-6 text-slate-100 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <header className="flex flex-col justify-between gap-5 border-b border-white/15 pb-5 lg:flex-row lg:items-end">
          <div>
            <p className={`${smallLabel} mb-3`}>
              Ledger intelligence / recorded statements
            </p>
            <h1
              className={`ledger-display text-4xl font-semibold tracking-tight sm:text-5xl ${glow}`}
            >
              Financial Analytics
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-400">
              Follow money across accounts, inspect busy statement days, and
              open the evidence behind each line.
            </p>
          </div>
          <div className="font-mono text-xs text-slate-400 lg:text-right">
            <p>
              {activeRows.length.toLocaleString("en-IN")} statement lines in
              view
            </p>
            <p className="mt-1">{dateRangeLabel(start, end)}</p>
            {selectedDate && (
              <p className="mt-1 text-emerald-300">
                Date locked · {formatDateIndian(selectedDate)}
              </p>
            )}
          </div>
        </header>

        <section
          className={`${panel} grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end`}
          aria-label="Analytics filters"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className={smallLabel}>Date range</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="text-xs text-slate-400">
                  Start date
                  <input
                    aria-label="Start date"
                    type="date"
                    min={first}
                    max={end || last}
                    value={start}
                    onChange={(event) => {
                      setStart(event.target.value);
                      setPreset("");
                    }}
                    className="ml-2 rounded-lg border border-white/20 bg-black px-3 py-2 font-mono text-xs text-white [color-scheme:dark] focus:border-white focus:outline-none"
                  />
                </label>
                <label className="text-xs text-slate-400">
                  End date
                  <input
                    aria-label="End date"
                    type="date"
                    min={start || first}
                    max={last}
                    value={end}
                    onChange={(event) => {
                      setEnd(event.target.value);
                      setPreset("");
                    }}
                    className="ml-2 rounded-lg border border-white/20 bg-black px-3 py-2 font-mono text-xs text-white [color-scheme:dark] focus:border-white focus:outline-none"
                  />
                </label>
              </div>
            </div>
            <div
              className="flex flex-wrap gap-2"
              aria-label="Quick date ranges"
            >
              {["All Dates", "Last 7 Days", "Last 14 Days", "This Month"].map(
                (choice) => (
                  <button
                    key={choice}
                    type="button"
                    aria-pressed={preset === choice}
                    onClick={() => choosePreset(choice)}
                    className={`rounded-full border px-3 py-2 font-mono text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-white ${preset === choice ? "glossy-silver-pill text-white" : "border-white/15 bg-black text-slate-400 hover:border-white/50 hover:text-white"}`}
                  >
                    {choice}
                  </button>
                ),
              )}
            </div>
          </div>
          <div className="border-t border-white/10 pt-4 lg:border-l lg:border-t-0 lg:py-0 lg:pl-5">
            <p className={smallLabel}>Bank accounts</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { id: "", bank: "ALL BANKS", accountLast4: "" },
                ...bankAccounts,
              ].map((account) => (
                <button
                  key={account.id || "all"}
                  type="button"
                  aria-pressed={bankId === account.id}
                  onClick={() => {
                    setBankId(account.id);
                    sound.playPluck(0.52, 0.2);
                  }}
                  className={`rounded-lg border px-3 py-2 font-mono text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-white ${bankId === account.id ? "bg-white text-black border-white" : "bg-zinc-900/70 text-slate-300 border-white/15 hover:border-white/50"}`}
                >
                  {displayText(account.bank)}
                  {account.accountLast4 ? ` · ${account.accountLast4}` : ""}
                </button>
              ))}
            </div>
          </div>
          {selectedDate && (
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className="inline-flex items-center gap-2 text-xs text-emerald-200 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-white lg:col-span-2"
            >
              <X size={13} /> Clear Date Lock
            </button>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 lg:col-span-2">
            <p className="max-w-xl text-xs leading-relaxed text-slate-400">Export all {rangeRows.length.toLocaleString("en-IN")} matching lines, summary figures, charts, and supporting detail for this date range and bank selection. A selected heatmap day does not limit the PDF.</p>
            <button type="button" onClick={downloadPdf} disabled={exporting || !start || !end || start > end} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-emerald-200/40 bg-emerald-200 px-4 py-2.5 text-xs font-semibold text-[#09231e] shadow-[0_7px_20px_rgba(116,220,187,.17)] transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50" aria-label="Download analytics PDF for selected date range">
              <Download size={15} /> {exporting ? "Preparing PDF..." : "Download PDF"}
            </button>
            {exportError && <p role="alert" className="w-full text-xs text-rose-300">{exportError}</p>}
          </div>
        </section>

        {!transactions.length ? (
          <div className={`${panel} py-12 text-center text-sm text-slate-300`}>
            No imported statements yet. Use Sync Bank Feed, then return to
            Analytics.
          </div>
        ) : (
          <>
            <section aria-labelledby="analytics-metrics-title">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <h2 id="analytics-metrics-title" className="text-xl font-bold">
                  Six pillars
                </h2>
                <span className={smallLabel}>
                  All totals follow the active filters
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <MetricCard
                  icon={<ArrowDownLeft size={19} />}
                  label="Total money in"
                  value={money(totals.moneyInPaise)}
                  detail={`${totals.inCount} credits · internal contra excluded`}
                  accent="var(--chart-teal)"
                  ratio={share(totals.moneyInPaise, grossFlow)}
                  scaleLabel="Share of non-transfer movement"
                />
                <MetricCard
                  icon={<ArrowUpRight size={19} />}
                  label="Total money out"
                  value={money(totals.moneyOutPaise)}
                  detail={`${totals.outCount} debits · internal contra excluded`}
                  accent="var(--chart-amber)"
                  ratio={share(totals.moneyOutPaise, grossFlow)}
                  scaleLabel="Share of non-transfer movement"
                />
                <MetricCard
                  icon={<RefreshCw size={18} />}
                  label="Internal transfers"
                  value={money(totals.transferPaise)}
                  detail={`${totals.transferCount} matched pairs · ${totals.transferLines} statement lines`}
                  foot="Excluded from P&L · pair volume counted once"
                  accent="var(--chart-blue)"
                  ratio={share(totals.transferPaise, allMovement)}
                  scaleLabel="Share of all movement"
                />
                <MetricCard
                  icon={<Layers3 size={19} />}
                  label="Subscriptions & recurring"
                  value={money(recurringPaise)}
                  detail={`${recurringRows.length} recurring debits · ${activeSubscriptionRows.filter((sub) => sub.status === "active").length} active plans`}
                  foot={`${unlinkedRecurring} recurring lines without a subscription match`}
                  accent="var(--chart-violet)"
                  ratio={share(recurringPaise, totals.moneyOutPaise)}
                  scaleLabel="Share of money out"
                />
                <MetricCard
                  icon={<CircleAlert size={19} />}
                  label="Possible duplicates"
                  value={`${totals.duplicateCount} lines`}
                  detail={`${money(totals.duplicateExposurePaise)} possible extra statement value`}
                  foot="Potential exposure; no bank payment was stopped"
                  accent="var(--chart-amber)"
                  ratio={share(totals.duplicateCount, activeRows.length)}
                  scaleLabel="Share of statement lines"
                />
                <MetricCard
                  icon={<ShieldAlert size={19} />}
                  label="Fraud alerts & payout status"
                  value={`${totals.fraudCount} flagged`}
                  detail={`${alerts.length} beneficiary-change alerts · ${money(totals.fraudPaise)} flagged line value`}
                  foot="Escrow or frozen amount not supplied by Account Aggregator (AA) Bank Sync"
                  accent="var(--chart-red)"
                  ratio={share(totals.fraudCount, activeRows.length)}
                  scaleLabel="Share of statement lines"
                />
              </div>
            </section>

            <section className={panel} aria-labelledby="cash-flow-title">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className={smallLabel}>Cash movement / selected statements</p>
                  <h2 id="cash-flow-title" className="mt-2 text-xl font-bold">Money in vs. money out</h2>
                  <p className="mt-1 text-xs text-slate-400">Paired columns compare receipts and payments; the blue trace shows net movement. Filters and day lock apply throughout.</p>
                </div>
                <div className="flex items-center gap-4 font-mono text-[11px] text-slate-300">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--chart-teal)" }}/>Money in</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--chart-amber)" }}/>Money out</span>
                  <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded-full" style={{ background: "var(--chart-blue)" }}/>Net</span>
                </div>
              </div>
              <div className="mt-6"><FlowBars data={flow}/></div>
              <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-white/10 pt-3 font-mono text-[11px] text-slate-400"><span>{flow.length} active periods</span><span>Net movement <span className={totals.moneyInPaise >= totals.moneyOutPaise ? "text-emerald-200" : "text-amber-200"}>{money(totals.moneyInPaise - totals.moneyOutPaise)}</span></span></div>
            </section>

            <section className={panel} aria-labelledby="heatmap-title">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className={smallLabel}>Statement activity</p>
                  <h2 id="heatmap-title" className="mt-2 text-xl font-bold">
                    Transaction heatmap
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Click a day to inspect its bank lines. Color shows
                    transaction count.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-slate-400">
                  <span>LESS</span>
                  {[0, 1, 3, 5, 8].map((count) => (
                    <span
                      key={count}
                      className={`h-3 w-3 rounded-sm ${heatClass(count)}`}
                    />
                  ))}
                  <span>MORE</span>
                  <span className="ml-2 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400" />{" "}
                    Risk / duplicate
                  </span>
                </div>
              </div>
              <div className={weeks.length <= 12 ? "mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]" : "mt-5"}>
              {days.length <= 28 ? <div className="grid grid-cols-2 gap-2 pb-5 sm:grid-cols-4 xl:grid-cols-7" aria-label="Daily activity tiles">
                {days.map((day) => {
                  const rows = byDay.get(day) ?? [];
                  const count = rows.length;
                  const inside = day >= start && day <= end;
                  const risk = rows.some((tx) => tx.status === "flagged_fraud" || tx.isDuplicate || duplicateIds.has(tx.id));
                  const dayLabel = new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "UTC" }).format(utcDate(day));
                  return <button key={day} type="button" disabled={!inside} aria-pressed={selectedDate === day} aria-label={`${formatDateIndian(day)}: ${count} transactions${risk ? ", risk or duplicate flag" : ""}`} title={`${formatDateIndian(day)} · ${count} transactions`} onClick={() => { setSelectedDate(selectedDate === day ? null : day); sound.playPluck(.62, .25); }} className={`relative flex min-h-[98px] flex-col justify-between rounded-xl border p-3 text-left transition-colors hover:border-emerald-200/50 focus-visible:outline-2 focus-visible:outline-white disabled:cursor-default disabled:opacity-35 ${selectedDate === day ? "border-white bg-emerald-300/10" : "border-white/10 bg-[linear-gradient(155deg,#18232a,#0c1318)]"}`}>
                    <span className="font-mono text-[10px] text-slate-400">{dayLabel.toUpperCase()} <span className="text-slate-200">{day.slice(8)}</span></span>
                    {risk && <span className="absolute right-3 top-3 h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_8px_#fb7185]" />}
                    <span className="flex items-baseline gap-1"><strong className="ledger-display text-2xl font-semibold leading-none tabular-nums text-white">{count}</strong><span className="text-[10px] text-slate-500">lines</span></span>
                    <span className="h-1 overflow-hidden rounded-full bg-white/[.07]"><span className="block h-full rounded-full bg-gradient-to-r from-emerald-700 to-emerald-300" style={{ width: `${count / maxDayCount * 100}%` }}/></span>
                  </button>;
                })}
              </div> :
              <div className="flex gap-3 overflow-x-auto pb-14">
                <div className="sticky left-0 z-10 shrink-0 bg-[#11151b] pt-6 font-mono text-[10px] text-slate-500">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                    (day) => (
                      <div key={day} className="flex h-[19px] items-center">
                        {day}
                      </div>
                    ),
                  )}
                </div>
                <div className="flex gap-1">
                  {weeks.map((week, index) => {
                    const monthStart = week.find((day) => day >= start && day <= end && day.endsWith("-01"));
                    const label =
                      monthStart || index === 0
                        ? new Intl.DateTimeFormat("en-IN", {
                            month: "short",
                            year: "2-digit",
                            timeZone: "UTC",
                          }).format(utcDate(monthStart || week[0]))
                        : "";
                    return (
                      <div key={week[0]} className="shrink-0">
                        <div className="h-6 whitespace-nowrap font-mono text-[10px] text-slate-500">
                          {label}
                        </div>
                        <div className="flex flex-col gap-1">
                          {week.map((day) => {
                            const rows = byDay.get(day) ?? [];
                            const count = rows.length;
                            const risk = rows.some(
                              (tx) =>
                                tx.status === "flagged_fraud" ||
                                tx.isDuplicate ||
                                duplicateIds.has(tx.id),
                            );
                            const inPaise = rows.reduce(
                              (n, tx) =>
                                n +
                                (signedPaise(tx) > 0 && !isTransfer(tx)
                                  ? signedPaise(tx)
                                  : 0),
                              0,
                            );
                            const outPaise = rows.reduce(
                              (n, tx) =>
                                n +
                                (signedPaise(tx) < 0 && !isTransfer(tx)
                                  ? -signedPaise(tx)
                                  : 0),
                              0,
                            );
                            const inside = day >= start && day <= end;
                            return (
                              <button
                                key={day}
                                type="button"
                                disabled={!inside}
                                aria-pressed={selectedDate === day}
                                aria-label={`${formatDateIndian(day)}: ${count} transactions, ${money(inPaise)} in, ${money(outPaise)} out${risk ? ", risk or duplicate flag" : ""}`}
                                title={`${formatDateIndian(day)} · ${count} transactions · +${money(inPaise)} / -${money(outPaise)}`}
                                onMouseEnter={() => sound.playPluck(0.5, 0.2)}
                                onClick={() => {
                                  setSelectedDate(
                                    selectedDate === day ? null : day,
                                  );
                                  sound.playPluck(0.62, 0.25);
                                }}
                                className={`group relative h-[15px] w-[15px] rounded-[3px] transition-transform hover:z-20 hover:scale-125 focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-white ${inside ? heatClass(count) : "border border-transparent bg-transparent opacity-20"} ${selectedDate === day ? "outline-2 outline-offset-2 outline-white" : ""}`}
                              >
                                {risk && inside && (
                                  <span className="absolute -right-[2px] -top-[2px] h-[5px] w-[5px] rounded-full bg-red-500" />
                                )}
                                {inside && (
                                  <span className="pointer-events-none absolute top-[calc(100%+8px)] left-1/2 z-30 hidden w-48 -translate-x-1/2 rounded-lg border border-white/30 bg-zinc-950 p-2 text-left font-mono text-[10px] leading-relaxed text-white shadow-xl group-hover:block group-focus-visible:block">
                                    {formatDateIndian(day)}
                                    <br />
                                    {count} transactions
                                    <br />
                                    <span className="text-emerald-300">
                                      +{money(inPaise)}
                                    </span>{" "}
                                    ·{" "}
                                    <span className="text-rose-300">
                                      -{money(outPaise)}
                                    </span>
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>}
              {weeks.length <= 12 && <aside className="rounded-xl border border-white/10 bg-black/20 p-4" aria-label="Weekday activity profile">
                <div className="flex items-baseline justify-between gap-2"><p className={smallLabel}>Weekday profile</p><strong className="font-mono text-xs text-white">{activeDayCount} active days</strong></div>
                <div className="mt-4 space-y-2.5">{weekdayProfile.map((day) => <div key={day.label} className="grid grid-cols-[32px_1fr_28px] items-center gap-2"><span className="font-mono text-[10px] text-slate-400">{day.label}</span><div className="h-[6px] overflow-hidden rounded-full bg-white/[.07]"><div className="h-full rounded-full bg-gradient-to-r from-emerald-800 to-emerald-300" style={{ width: `${day.count / maxWeekday * 100}%` }}/></div><span className="text-right font-mono text-[10px] text-slate-300">{day.count}</span></div>)}</div>
                <p className="mt-4 border-t border-white/10 pt-3 font-mono text-[10px] text-slate-500">{busiestDay ? `Busiest ${formatDateIndian(busiestDay)} · ${byDay.get(busiestDay)?.length ?? 0} lines` : "No activity in this range"}</p>
              </aside>}
              </div>
              <p className="font-mono text-[10px] text-slate-500">
                {dateRangeLabel(start, end)} · {rangeRows.length} lines across{" "}
                {bankId
                  ? bankAccounts.find((a) => a.id === bankId)?.bank
                  : "all banks"}
              </p>
            </section>

            <AnimatePresence mode="wait">
              {selectedDate && (
                <motion.section
                  key={selectedDate}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className={`${panel} overflow-hidden`}
                  aria-labelledby="daily-title"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className={smallLabel}>Daily statement drilldown</p>
                      <h2 id="daily-title" className="mt-1 text-xl font-bold">
                        {formatDateIndian(selectedDate)}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedDate(null)}
                      className="flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-xs hover:bg-white hover:text-black"
                    >
                      <X size={13} /> Clear Date Lock
                    </button>
                  </div>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      ["Money in", money(totals.moneyInPaise)],
                      ["Money out", money(totals.moneyOutPaise)],
                      [
                        "Net cash delta",
                        money(totals.moneyInPaise - totals.moneyOutPaise),
                      ],
                      ["Statement lines", String(activeRows.length)],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-xl border border-white/15 bg-black/50 p-4"
                      >
                        <p className={smallLabel}>{label}</p>
                        <p className="mt-2 font-mono text-lg font-semibold">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 grid gap-5 md:grid-cols-2">
                    <div>
                      <h3 className="mb-3 text-sm font-semibold">Bank split</h3>
                      {bankAccounts
                        .filter((a) =>
                          activeRows.some((tx) => tx.accountId === a.id),
                        )
                        .map((a) => {
                          const stat = summarize(
                            activeRows.filter((tx) => tx.accountId === a.id),
                          );
                          return (
                            <p
                              key={a.id}
                              className="flex justify-between border-b border-white/10 py-2 text-xs"
                            >
                              <span>
                                {a.bank} · {a.accountLast4}
                              </span>
                              <span className="font-mono">
                                +{money(stat.moneyInPaise)} / -
                                {money(stat.moneyOutPaise)} · contra{" "}
                                {money(stat.transferPaise)}
                              </span>
                            </p>
                          );
                        })}
                      {!activeRows.length && (
                        <p className="text-xs text-slate-500">
                          No bank lines on this date.
                        </p>
                      )}
                    </div>
                    <div>
                      <h3 className="mb-3 text-sm font-semibold">
                        Category split
                      </h3>
                      {expense.map((item) => (
                        <p
                          key={item.name}
                          className="flex justify-between border-b border-white/10 py-2 text-xs"
                        >
                          <span>{displayText(item.name)}</span>
                          <span className="font-mono">
                            {money(item.amountPaise)}
                          </span>
                        </p>
                      ))}
                      {!expense.length && (
                        <p className="text-xs text-slate-500">
                          No non-transfer debits on this date.
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="mt-5 font-mono text-[11px] text-slate-400">
                    {totals.recurringCount} recurring · {totals.transferLines}{" "}
                    transfer lines · {totals.duplicateCount} possible duplicate
                    lines · {totals.fraudCount} flagged
                  </p>
                  <div className="mt-4 max-h-[430px] overflow-auto rounded-xl border border-white/10">
                    {activeRows.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3 text-xs last:border-0 hover:bg-white/5"
                      >
                        <span className="w-20 shrink-0 font-mono font-bold">
                          {signedPaise(tx) > 0 ? "+" : "-"}
                          {money(Math.abs(signedPaise(tx)))}
                        </span>
                        <span
                          className="min-w-[145px] flex-1 truncate"
                          title={displayText(tx.rawNarration)}
                        >
                          {displayText(tx.vendorClientName)}
                        </span>
                        <span className="text-slate-400">{displayText(tx.category)}</span>
                        <span className="rounded border border-white/20 px-1.5 py-0.5 font-mono text-[10px]">
                          {tx.rail}
                        </span>
                        <span className="font-mono text-slate-400">
                          {tx.confidence}%
                        </span>
                        <button
                          type="button"
                          onClick={() => onSelectTransactionForTrace(tx)}
                          className="ml-auto flex items-center gap-1 rounded border border-white/20 px-2 py-1 hover:bg-white hover:text-black"
                        >
                          Decision Trace <ChevronRight size={12} />
                        </button>
                      </div>
                    ))}
                    {!activeRows.length && (
                      <p className="p-4 text-xs text-slate-500">
                        No transactions on this date for the chosen bank.
                      </p>
                    )}
                  </div>
                </motion.section>
              )}
            </AnimatePresence>

            <section aria-labelledby="bank-title">
              <div className="mb-4">
                <p className={smallLabel}>Account statements</p>
                <h2 id="bank-title" className="mt-1 text-xl font-bold">
                  Bank Account Statement Breakdown
                </h2>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {bankCards.map((account) => {
                  const rows = activeRows.filter(
                    (tx) => tx.accountId === account.id,
                  );
                  const stat = summarize(rows);
                  const originalOpening = paise(account.openingBalance);
                  const periodEnd = selectedDate ?? end;
                  const accountHistory = transactions
                    .filter(
                      (tx) =>
                        tx.accountId === account.id && tx.date <= periodEnd,
                    )
                    .sort(
                      (a, b) =>
                        a.date.localeCompare(b.date) ||
                        (a.lineNo ?? 0) - (b.lineNo ?? 0),
                    );
                  const lastLine = accountHistory.at(-1);
                  const closing = accountClosingPaise(accountHistory, account.openingBalance);
                  const full = Math.max(
                    1,
                    stat.moneyInPaise,
                    stat.moneyOutPaise,
                    stat.transferPaise,
                  );
                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => {
                        setBankId(account.id);
                        sound.playPluck(0.65, 0.25);
                      }}
                      className={`${panel} group text-left transition-all hover:border-white/60 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white`}
                    >
                      <div className="flex justify-between gap-3">
                        <div>
                          <p className={smallLabel}>
                            {account.statementFormat.toUpperCase()} /{" "}
                            {displayText(account.purpose)}
                          </p>
                          <h3 className="mt-2 text-lg font-bold">
                            {displayText(account.bank)}
                          </h3>
                          <p className="font-mono text-xs text-slate-400">
                            Account •••• {account.accountLast4 || "unknown"}
                          </p>
                        </div>
                        <span className="text-xs text-slate-400 group-hover:text-white">
                          Filter this bank{" "}
                          <ChevronRight size={13} className="inline" />
                        </span>
                      </div>
                      <div className="mt-6 space-y-3">
                        {[
                          ["Money in", stat.moneyInPaise, "bg-emerald-300"],
                          ["Money out", stat.moneyOutPaise, "bg-slate-300"],
                          [
                            "Internal transfers",
                            stat.transferPaise,
                            "bg-zinc-500",
                          ],
                        ].map(([label, value, color]) => (
                          <div key={String(label)}>
                            <div className="mb-1 flex justify-between font-mono text-[11px]">
                              <span>{label}</span>
                              <span>{money(Number(value))}</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-black/70">
                              <div
                                className={`h-full rounded-full ${color}`}
                                style={{
                                  width: `${Math.max(0, Math.min(100, (Number(value) / full) * 100))}%`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 font-mono text-[11px]">
                        <p>
                          <span className="text-slate-500">Source opening</span>
                          <br />
                          {money(originalOpening)}
                        </p>
                        <p>
                          <span className="text-slate-500">
                            Closing as of {periodEnd}
                          </span>
                          <br />
                          {money(closing)}
                        </p>
                      </div>
                      <p className="mt-3 font-mono text-[11px] text-amber-200">
                        {stat.pendingCount} pending review / fraud items
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>

            <section
              className="grid gap-4 xl:grid-cols-2"
              aria-label="Spending details"
            >
              <div className={panel}>
                <p className={smallLabel}>Non-transfer debits</p>
                <h2 className="mt-2 text-xl font-bold">
                  Category distribution
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Compare the largest recorded debit categories in the current selection.
                </p>
                <div className="mt-5">
                  <CategoryBars items={expense.map(item => ({ name: item.name, value: item.amountPaise / 100 }))}/>
                </div>
                <div className="mt-5 border-t border-white/10 pt-4">
                  <p className={smallLabel}>Share of total spend</p>
                  <div className="mt-2"><SpendDonut items={expense.map(item => ({ name: item.name, value: item.amountPaise / 100 }))} totalLabel="Total debits"/></div>
                </div>
                <p className="mt-4 border-t border-white/10 pt-3 font-mono text-[11px] text-slate-500">{expense.length} categories · {money(totalExpense)} in non-transfer debits</p>
              </div>
              <div className={panel}>
                <p className={smallLabel}>Operational spend</p>
                <h2 className="mt-2 text-xl font-bold">
                  Recurring vs. one-off
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Excludes payroll, tax, loan repayment, personal drawings, and
                  internal transfers.
                </p>
                <div className="mt-5">
                  <SpendDonut items={[{ name: "Recurring", value: recurringOperationalPaise / 100 }, { name: "One-off", value: oneOffOperationalPaise / 100 }]} totalLabel="Operational"/>
                </div>
                <details className="mt-5 border-t border-white/10 pt-4">
                  <summary className="cursor-pointer text-xs font-medium text-slate-300 hover:text-white">Subscription records and recurring patterns</summary>
                  <div className="mt-4 max-h-[435px] space-y-2 overflow-auto pr-1">
                  {activeSubscriptionRows.map((sub) => {
                    const matches = subscriptionMatches(sub, activeRows);
                    const actualPaise = matches.reduce(
                      (n, tx) => n + Math.abs(signedPaise(tx)),
                      0,
                    );
                    const expected = expectedRenewalInRange(
                      sub,
                      selectedDate ?? start,
                      selectedDate ?? end,
                    );
                    const linkedHistory = subscriptionMatches(
                      sub,
                      transactions.filter(
                        (tx) => !bankId || tx.accountId === bankId,
                      ),
                    );
                    const missingRenewal =
                      expected &&
                      !linkedHistory.some(
                        (tx) =>
                          Math.abs(
                            utcDate(tx.date).getTime() -
                              utcDate(expected).getTime(),
                          ) <=
                          5 * 86400000,
                      );
                    const amountMismatch = matches.some(
                      (tx) =>
                        Math.abs(
                          Math.abs(signedPaise(tx)) - paise(sub.currentAmount),
                        ) >
                        Math.max(
                          100,
                          Math.round(paise(sub.currentAmount) * 0.02),
                        ),
                    );
                    const possibleUnused =
                      !!sub.lastUsedOn &&
                      last &&
                      sub.lastUsedOn < shiftDays(last, -90) &&
                      matches.length > 0 &&
                      sub.status === "active";
                    return (
                      <div
                        key={sub.id}
                        className="rounded-xl border border-white/10 bg-black/45 p-3 text-xs"
                      >
                        <div className="flex flex-wrap justify-between gap-2">
                          <span className="font-semibold">
                            {displayText(sub.vendorName)}
                          </span>
                          <span className="font-mono text-slate-400">
                            {sub.billingCycle} · {sub.status}
                          </span>
                        </div>
                        <p className="mt-1 text-slate-400">{displayText(sub.name)}</p>
                        <div className="mt-2 flex flex-wrap justify-between gap-2 font-mono">
                          <span>
                            Expected {formatINR(sub.currentAmount)} / cycle
                          </span>
                          <span>
                            Actual {money(actualPaise)} · {matches.length}{" "}
                            debit(s)
                          </span>
                        </div>
                        {missingRenewal && (
                          <p className="mt-2 text-amber-200">
                            No bank match within five days of the{" "}
                            {formatDateIndian(expected)} renewal
                          </p>
                        )}
                        {amountMismatch && (
                          <p className="mt-2 text-amber-200">
                            Actual debit differs from the expected plan amount
                            by more than 2%.
                          </p>
                        )}
                        {possibleUnused && (
                          <p className="mt-2 text-amber-200">
                            Possible unused subscription · last recorded use{" "}
                            {formatDateIndian(sub.lastUsedOn!)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {unlinkedVendors.map((vendor) => (
                    <div
                      key={vendor.name}
                      className="rounded-xl border border-white/10 bg-black/45 p-3 text-xs"
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="font-semibold">{displayText(vendor.name)}</span>
                        <span className="font-mono text-amber-200">
                          Pattern only · no source plan
                        </span>
                      </div>
                      <p className="mt-2 font-mono text-slate-300">
                        {vendor.count} recurring debit(s) ·{" "}
                        {money(vendor.amountPaise)} actual in selection
                      </p>
                      <p className="mt-1 text-slate-500">
                        Billing cycle and expected amount not supplied by a
                        subscription record.
                      </p>
                    </div>
                  ))}
                  {!activeSubscriptionRows.length &&
                    !unlinkedVendors.length && (
                      <p className="text-xs text-slate-500">
                        No subscription or recurring records in this selection.
                      </p>
                    )}
                  </div>
                </details>
              </div>
            </section>
            <p className="border-t border-white/10 pt-5 font-mono text-[10px] leading-relaxed text-slate-500">
              Statement data through {last || "unknown"}. Transfers are excluded
              from inflow and outflow; possible duplicates remain marked for
              review. Beneficiary alerts do not confirm frozen payouts.{" "}
              {analytics.reviewQueueCount} transactions currently need review
              across the full imported dataset.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
