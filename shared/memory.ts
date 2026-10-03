import type { Transaction } from "../src/types/finance.ts";
import { isTransfer, signedPaise, shiftDays } from "../src/lib/analyticsMath.ts";
import { CATEGORIES, type Category } from "./categories.ts";
import { planningMetrics, inr, type PlanningState } from "./planning.ts";

export type SpendPeriod = "weekly" | "monthly" | "yearly";
export interface AgentMetadata {
  pipeline: "n8n-gemini-agent";
  enrichmentSource: "local" | "Gemini" | "n8n";
  behaviorTag: string; anomalyScore: number; observedPattern: string;
  budgetImpact: unknown; savingsRecommendation: unknown;
  rebalanceSuggestion: unknown; goalImpact: unknown;
}
export const LIVE_PIPELINE_STAGES = [
  "Webhook Trigger & Parallel PII / Velocity Extraction",
  "Merge Context Snapshot (SQLite + Memory Injection)",
  "Autonomous Financial Agent (Gemini Flash + Simple Memory + Elasticity & Goal Tools)",
  "Anomaly & Budget Breach Router",
  "Recovery Rebalance Plan / Micro-Savings Sweep",
  "Send to LedgerLens (Live SSE Broadcast)",
] as const;
export const merchantKey = (name: string) => name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export const fixedCategories = new Set<string>(["rent", "utilities", "insurance", "loan_repayment", "tax_payment", "salary_payment", "bank_charges"]);
export const roundMoney = (n: number) => Math.round(n * 100) / 100;
export interface Trait { id: string; text: string; confidence: number; sampleSize: number; updatedAt: string; kind: "behavior" | "preference" | "elasticity" }
export interface PreferenceRule { id: string; kind: "category" | "budget" | "goal" | "profile"; merchant?: string; category?: Category; description: string; updatedAt: string }
export interface RebalanceSuggestion { fromCategory: Category; toCategory: Category; suggestedAmount: number; reason: string }
export interface LearningUpdate {
  transactionId: string; createdAt: string; source: "Built-in analysis" | "Gemini" | "n8n";
  observedPattern: string; explanation?: string;
  agentMetadata?: AgentMetadata;
  pipeline?: { status: "local" | "complete" | "fallback"; message: string };
  velocityForecast: { category: string; dailyBurnRate: number; projectedMonthEndSpend: number; exhaustionDate: string | null } | null;
  rebalanceSuggestion: RebalanceSuggestion | null;
  goalImpact: { goalId: string; goalName: string; days: number | null; direction: "accelerates" | "delays" | "neutral"; recovery: string; microSweepAmount: number } | null;
}
export interface AgentMemory {
  version: 1; revision: number; updatedAt: string; asOf: string; transactionCount: number;
  merchantHistory: { key: string; name: string; visitCount: number; expenseCount: number; averageSpend: number; lastDate: string }[];
  learnedTraits: Trait[]; preferenceRules: PreferenceRule[]; learningUpdates: LearningUpdate[];
}

export function spendMix(rows: Transaction[], asOf: string, period: SpendPeriod) {
  const start = period === "weekly" ? shiftDays(asOf, -6) : period === "yearly" ? `${asOf.slice(0, 4)}-01-01` : `${asOf.slice(0, 7)}-01`;
  const totals = new Map<string, number>();
  for (const tx of rows) if (tx.date >= start && tx.date <= asOf && !isTransfer(tx) && signedPaise(tx) < 0) totals.set(tx.category, (totals.get(tx.category) ?? 0) - signedPaise(tx));
  return { start, end: asOf, items: [...totals].map(([name, amount]) => ({ name, value: amount / 100 })).sort((a, b) => b.value - a.value) };
}

export function adaptiveMetrics(rows: Transaction[], plan: PlanningState, asOf: string) {
  const metrics = planningMetrics(rows, plan, asOf);
  const days = Number(asOf.slice(8));
  const monthDays = new Date(Date.UTC(Number(asOf.slice(0, 4)), Number(asOf.slice(5, 7)), 0)).getUTCDate();
  const budgets = metrics.budgets.map(b => {
    const dailyBurnRate = b.spent / days;
    const projectedMonthEndSpend = roundMoney(dailyBurnRate * monthDays);
    const exhaustedDay = dailyBurnRate > 0 ? Math.ceil(b.limit / dailyBurnRate) : null;
    return { ...b, dailyBurnRate, projectedMonthEndSpend, projectedPercent: projectedMonthEndSpend / b.limit * 100, flexible: !fixedCategories.has(b.category), exhaustionDate: exhaustedDay !== null && exhaustedDay <= monthDays ? shiftDays(metrics.monthStart, Math.max(0, exhaustedDay - 1)) : null };
  });
  const rebalances: RebalanceSuggestion[] = [];
  for (const target of budgets.filter(b => b.projectedMonthEndSpend > b.limit)) {
    const donor = budgets.filter(b => b.category !== target.category && b.flexible && b.limit > Math.max(b.spent, b.projectedMonthEndSpend)).sort((a, b) => (b.limit - b.projectedMonthEndSpend) - (a.limit - a.projectedMonthEndSpend))[0];
    if (donor) {
      const suggestedAmount = Math.floor(Math.min(donor.limit - Math.max(donor.spent, donor.projectedMonthEndSpend) - 0.01, target.projectedMonthEndSpend - target.limit) * 100) / 100;
      if (suggestedAmount > 0) rebalances.push({ fromCategory: donor.category, toCategory: target.category, suggestedAmount, reason: `Use forecast surplus in ${donor.name}; its revised limit still covers projected spending. Total budget stays the same.` });
    }
  }
  // Use the full covered calendar interval, including quiet days, instead of averaging only spending days.
  const eligible = rows.filter(t => t.date <= asOf && !isTransfer(t));
  const first = eligible.map(t => t.date).sort()[0] ?? asOf;
  const coveredDays = Math.max(1, Math.floor((Date.parse(asOf) - Date.parse(first)) / 86400000) + 1);
  const net = eligible.reduce((sum, t) => sum + signedPaise(t), 0) / 100;
  const dailySavingsVelocity = Math.max(0, net / coveredDays);
  const priorityId = plan.profile.priorityGoalId;
  const ordered = [...metrics.goals].sort((a, b) => Number(b.id === priorityId) - Number(a.id === priorityId));
  let cumulative = 0;
  const goals = ordered.map(g => {
    cumulative += g.remaining;
    const etaDays = dailySavingsVelocity > 0 ? Math.ceil(cumulative / dailySavingsVelocity) : null;
    return { ...g, projectedCompletionDate: !g.remaining ? asOf : etaDays !== null && etaDays <= 36500 ? shiftDays(asOf, etaDays) : null };
  });
  const reserved = plan.allocationsByMonth?.[asOf.slice(0, 7)] ?? 0;
  const availableToAllocate = Math.max(0, roundMoney(metrics.month.savings - reserved));
  const topGoal = goals.find(g => g.remaining > 0);
  const microSweepAmount = topGoal ? Math.floor(Math.min(availableToAllocate, topGoal.remaining, availableToAllocate * 0.1) * 100) / 100 : 0;
  return { ...metrics, budgets, rebalances, goals, dailySavingsVelocity, coveredDays, availableToAllocate, microSweepAmount, topGoal };
}

export function deriveMemory(rows: Transaction[], plan: PlanningState, asOf: string, prior?: AgentMemory | null): AgentMemory {
  const updatedAt = new Date().toISOString();
  const merchants = new Map<string, AgentMemory["merchantHistory"][number] & { spent: number }>();
  const eligible = rows.filter(t => t.date <= asOf && !isTransfer(t));
  for (const tx of eligible) {
    const name = tx.counterpartyText || tx.vendorClientName;
    const key = merchantKey(name);
    if (!key) continue;
    const entry = merchants.get(key) ?? { key, name, visitCount: 0, expenseCount: 0, averageSpend: 0, lastDate: tx.date, spent: 0 };
    entry.visitCount++;
    if (signedPaise(tx) < 0) { entry.expenseCount++; entry.spent -= signedPaise(tx); }
    entry.lastDate = entry.lastDate > tx.date ? entry.lastDate : tx.date;
    merchants.set(key, entry);
  }
  const history = [...merchants.values()].map(({ spent, ...m }) => ({ ...m, averageSpend: m.expenseCount ? roundMoney(spent / 100 / m.expenseCount) : 0 }));
  const traits: Trait[] = [];
  const add = (id: string, text: string, sampleSize: number, kind: Trait["kind"] = "behavior") => traits.push({ id, text, sampleSize, kind, confidence: kind === "preference" ? 1 : Math.min(.95, sampleSize / (sampleSize + 10)), updatedAt });
  const expenses = eligible.filter(t => signedPaise(t) < 0);
  const weekend = expenses.filter(t => [0, 6].includes(new Date(`${t.date}T00:00:00Z`).getUTCDay()));
  const weekday = expenses.filter(t => !weekend.includes(t));
  if (weekend.length >= 3 && weekday.length >= 3) {
    const avg = (ts: Transaction[]) => ts.reduce((s, t) => s + t.amount, 0) / ts.length;
    const delta = (avg(weekend) / avg(weekday) - 1) * 100;
    add("weekend", `Weekend purchase size is ${Math.abs(delta).toFixed(0)}% ${delta >= 0 ? "higher" : "lower"} than weekday purchase size (${weekend.length} vs ${weekday.length} purchases).`, expenses.length);
  }
  for (const m of history.filter(m => m.expenseCount >= 3).sort((a, b) => b.expenseCount - a.expenseCount).slice(0, 5)) {
    add(`merchant:${m.key}`, `${m.name}: ${m.expenseCount} expenses, averaging ${inr(m.averageSpend)} each.`, m.expenseCount);
    const visits = expenses.filter(t => merchantKey(t.counterpartyText || t.vendorClientName) === m.key).sort((a, b) => a.date.localeCompare(b.date));
    if (visits.length >= 6) {
      const recent = visits.slice(-3).reduce((s, t) => s + t.amount, 0) / 3;
      const previous = visits.slice(0, -3).reduce((s, t) => s + t.amount, 0) / (visits.length - 3);
      if (previous > 0) add(`drift:${m.key}`, `${m.name}: last three purchases average ${((recent / previous - 1) * 100).toFixed(0)}% change from earlier visits.`, visits.length);
    }
  }
  for (const b of plan.budgets) add(`elasticity:${b.category}`, `${CATEGORIES[b.category]} is treated as ${fixedCategories.has(b.category) ? "fixed; protected from automatic rebalance suggestions" : "flexible; eligible for surplus rebalance suggestions"}. Planning heuristic.`, expenses.filter(t => t.categoryId === b.category).length, "elasticity");
  for (const rule of prior?.preferenceRules ?? []) add(`rule:${rule.id}`, rule.description, 1, "preference");
  return { version: 1, revision: (prior?.revision ?? 0) + 1, updatedAt, asOf, transactionCount: rows.length, merchantHistory: history, learnedTraits: traits, preferenceRules: prior?.preferenceRules ?? [], learningUpdates: prior?.learningUpdates ?? [] };
}

export function memorySnapshot(memory: AgentMemory, rows: Transaction[], plan: PlanningState, tx: Transaction) {
  // Historical comparison excludes future-dated rows when a backdated transaction arrives.
  const priorRows = rows.filter(t => t.date <= tx.date);
  const history = deriveMemory(priorRows, plan, tx.date, memory);
  const merchantHistory = history.merchantHistory.find(m => m.key === merchantKey(tx.counterpartyText || tx.vendorClientName)) ?? null;
  const m = adaptiveMetrics(priorRows, plan, tx.date);
  const budget = m.budgets.find(b => b.category === tx.categoryId);
  return { asOf: tx.date, merchantHistory, merchantVisitCount: merchantHistory?.visitCount ?? 0, merchantAvgSpend: merchantHistory?.averageSpend ?? 0, categoryDailyBurnRate: budget?.dailyBurnRate ?? 0, projectedMonthEndSpend: budget?.projectedMonthEndSpend ?? 0, activeBudgets: m.budgets, activeGoals: m.goals, learnedTraits: memory.learnedTraits.slice(0, 16), preferenceRules: memory.preferenceRules.slice(-20) };
}

export function learnTransaction(tx: Transaction, before: ReturnType<typeof memorySnapshot>, rows: Transaction[], plan: PlanningState): LearningUpdate {
  const m = adaptiveMetrics(rows.filter(t => t.date <= tx.date), plan, tx.date);
  const b = m.budgets.find(b => b.category === tx.categoryId);
  const merchant = tx.counterpartyText || tx.vendorClientName;
  const count = rows.filter(t => t.date >= shiftDays(tx.date, -6) && t.date <= tx.date && merchantKey(t.counterpartyText || t.vendorClientName) === merchantKey(merchant)).length;
  const deviation = before.merchantAvgSpend > 0 ? (tx.amount / before.merchantAvgSpend - 1) * 100 : null;
  const transferable = isTransfer(tx);
  const observedPattern = transferable ? "Internal transfer recorded; excluded from expense velocity and goal-delay estimates." : tx.type === "credit" ? `${inr(tx.amount)} received from ${merchant}. Recorded income increases planning capacity.` : `${merchant}: ${deviation === null ? "no prior expense baseline yet" : `${Math.abs(deviation).toFixed(0)}% ${deviation >= 0 ? "above" : "below"} the usual ${inr(before.merchantAvgSpend)} purchase`}; ${count} visit${count === 1 ? "" : "s"} in the last seven days. Baseline: ${before.merchantVisitCount} prior visits.`;
  // Compare against the pre-transaction velocity; the new entry must not inflate its own denominator.
  const priorMetrics = adaptiveMetrics(rows.filter(t => t.id !== tx.id && t.date <= tx.date), plan, tx.date);
  const velocity = priorMetrics.dailySavingsVelocity;
  const impactDays = transferable ? 0 : velocity > 0 ? Math.round(tx.amount / velocity * 10) / 10 : null;
  return { transactionId: tx.id, createdAt: new Date().toISOString(), source: "Built-in analysis", observedPattern,
    pipeline: { status: "local", message: "Local learning saved; optional external enrichment can follow." },
    velocityForecast: b && !transferable && tx.type === "debit" ? { category: b.name, dailyBurnRate: b.dailyBurnRate, projectedMonthEndSpend: b.projectedMonthEndSpend, exhaustionDate: b.exhaustionDate } : null,
    rebalanceSuggestion: m.rebalances.find(r => r.toCategory === tx.categoryId) ?? null,
    goalImpact: m.topGoal ? { goalId: m.topGoal.id, goalName: m.topGoal.name, days: impactDays, direction: transferable ? "neutral" : tx.type === "credit" ? "accelerates" : "delays", recovery: tx.type === "credit" ? `Consider allocating ${inr(m.microSweepAmount)} of available net savings.` : `Use a daily planning limit of ${inr(m.safeToSpend)}; this is an advisory cap, not a payment block.`, microSweepAmount: m.microSweepAmount } : null,
  };
}
