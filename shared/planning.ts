import { CATEGORIES, type Category } from "./categories.ts";
import type { Transaction, SubscriptionSummary } from "../src/types/finance.ts";
import { isTransfer, signedPaise, shiftDays } from "../src/lib/analyticsMath.ts";

export interface FinancialProfile {
  name: string;
  monthlyIncomeTarget: number;
  savingsTargetPct: number;
  alertThresholds: number[];
  largeTransactionLimit: number;
  renewalReminders: boolean;
  voiceAlerts: boolean;
  spendingAlerts: boolean;
}
export interface Goal { id: string; name: string; target: number; saved: number; targetDate: string; color: string }
export interface Budget { category: Category; limit: number }
export interface PlanningState { profile: FinancialProfile; goals: Goal[]; budgets: Budget[]; starterPlan: boolean; revision: number }
export interface CoachReport { source: "Gemini" | "Built-in analysis"; generatedAt: string; asOf: string; summary: string; recommendations: string[]; warning?: string }
export interface SpendingAlert { id: string; title: string; detail: string; severity: "warning" | "critical" | "info" }
export const rupees = (paise: number) => Math.round(paise) / 100;
export const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
export const todayIndia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export const validDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function seedPlanning(rows: Transaction[], asOf: string): PlanningState {
  const spend = new Map<string, number>();
  const income = rows.filter(tx => tx.date.startsWith(asOf.slice(0, 7)) && signedPaise(tx) > 0 && !isTransfer(tx)).reduce((sum, tx) => sum + signedPaise(tx), 0);
  for (const tx of rows) if (tx.date.startsWith(asOf.slice(0, 7)) && signedPaise(tx) < 0 && !isTransfer(tx)) spend.set(tx.categoryId ?? "", (spend.get(tx.categoryId ?? "") ?? 0) - signedPaise(tx));
  const targetDate = (days: number) => shiftDays(asOf, days);
  return {
    profile: { name: "My financial plan", monthlyIncomeTarget: income > 0 ? Math.ceil(income / 100 / 1000) * 1000 : 150000, savingsTargetPct: 20, alertThresholds: [75, 90, 100], largeTransactionLimit: 25000, renewalReminders: true, voiceAlerts: false, spendingAlerts: true },
    goals: [
      { id: "emergency", name: "Emergency reserve", target: 300000, saved: 85000, targetDate: targetDate(365), color: "mint" },
      { id: "hardware", name: "MacBook upgrade", target: 180000, saved: 65000, targetDate: targetDate(180), color: "blue" },
      { id: "travel", name: "Europe travel fund", target: 250000, saved: 42500, targetDate: targetDate(300), color: "violet" },
      { id: "investment", name: "Investment & tax corpus", target: 150000, saved: 55000, targetDate: targetDate(180), color: "amber" },
      { id: "debt", name: "Debt payoff", target: 120000, saved: 30000, targetDate: targetDate(240), color: "rose" },
    ],
    budgets: (["personal", "software", "travel", "utilities", "rent", "other_expense"] as Category[]).map(category => ({ category, limit: Math.max(category === "rent" ? 25000 : 10000, Math.ceil((spend.get(category) ?? 0) / 100 / 0.7 / 1000) * 1000) })),
    starterPlan: true, revision: 0,
  };
}

export function planningMetrics(rows: Transaction[], plan: PlanningState, asOf: string) {
  const monthStart = `${asOf.slice(0, 7)}-01`;
  const weekStart = shiftDays(asOf, -6);
  const eligible = rows.filter(tx => !isTransfer(tx));
  const total = (start: string, end: string) => {
    let income = 0, expense = 0;
    for (const tx of eligible) if (tx.date >= start && tx.date <= end) { const n = signedPaise(tx); if (n > 0) income += n; else expense -= n; }
    return { income: rupees(income), expense: rupees(expense), savings: rupees(income - expense) };
  };
  const month = total(monthStart, asOf);
  const week = total(weekStart, asOf);
  const previousWeek = total(shiftDays(asOf, -13), shiftDays(asOf, -7));
  const days = Number(asOf.slice(8, 10));
  const monthDays = new Date(Date.UTC(Number(asOf.slice(0, 4)), Number(asOf.slice(5, 7)), 0)).getUTCDate();
  const remainingDays = Math.max(1, monthDays - days + 1);
  const savingsTarget = plan.profile.monthlyIncomeTarget * plan.profile.savingsTargetPct / 100;
  const spendCapacity = Math.min(month.income, plan.profile.monthlyIncomeTarget);
  const safeToSpend = Math.max(0, (spendCapacity - month.expense - savingsTarget) / remainingDays);
  const savingsRate = month.income > 0 ? month.savings / month.income * 100 : 0;
  const budgets = plan.budgets.map(budget => {
    const spent = rupees(eligible.filter(tx => tx.date >= monthStart && tx.date <= asOf && tx.type === "debit" && (tx.categoryId === budget.category || (!tx.categoryId && tx.category === CATEGORIES[budget.category]))).reduce((sum, tx) => sum + Math.abs(signedPaise(tx)), 0));
    return { ...budget, name: CATEGORIES[budget.category], spent, percent: spent / budget.limit * 100, remaining: Math.max(0, rupees(Math.round(budget.limit * 100) - Math.round(spent * 100))) };
  });
  const goals = plan.goals.map(goal => {
    const daysLeft = Math.max(0, Math.ceil((Date.parse(goal.targetDate) - Date.parse(asOf)) / 86400000));
    const remaining = Math.max(0, rupees(Math.round(goal.target * 100) - Math.round(goal.saved * 100)));
    return { ...goal, daysLeft, remaining, percent: Math.min(100, goal.saved / goal.target * 100), monthlyNeeded: remaining / Math.max(1, Math.ceil(daysLeft / 30)), overdue: remaining > 0 && goal.targetDate < asOf };
  });
  const over = budgets.filter(b => b.percent >= 100);
  const score = Math.round(Math.max(0, Math.min(100, (Math.min(1, Math.max(0, savingsRate) / Math.max(1, plan.profile.savingsTargetPct)) * 70) + (budgets.length ? (budgets.length - over.length) / budgets.length * 30 : 30))));
  const projectedExpense = month.expense / days * monthDays;
  const projectedNet = month.income / days * monthDays - projectedExpense;
  const weeklyChange = previousWeek.expense > 0 ? (week.expense - previousWeek.expense) / previousWeek.expense * 100 : null;
  const recommendations = [
    over.length ? `${over.map(b => b.name).join(", ")} ${over.length === 1 ? "is" : "are"} over budget. Reduce remaining discretionary purchases or revise the limits.` : `Your tracked categories are within budget. Keep daily discretionary spending under ${inr(safeToSpend)}.`,
    `Reserve ${inr(savingsTarget)} toward your ${plan.profile.savingsTargetPct}% monthly savings target. ${month.savings >= savingsTarget ? "Recorded net inflow currently covers this target." : `The current gap is ${inr(Math.max(0, savingsTarget - month.savings))}.`}`,
    ...(goals.filter(g => g.remaining > 0).slice(0, 2).map(g => `${g.name}: set aside ${inr(g.monthlyNeeded)} per month to reach ${inr(g.target)} by ${g.targetDate}.${g.overdue ? " This target date has passed; revise the schedule." : ""}`)),
    weeklyChange !== null ? `Spending in the last seven days is ${Math.abs(weeklyChange).toFixed(0)}% ${weeklyChange >= 0 ? "higher" : "lower"} than the previous seven days.${weeklyChange > 25 ? " Review the recent large purchases before adding new commitments." : ""}` : "There is not enough prior-week spending to measure a weekly change.",
  ];
  return { asOf, monthStart, weekStart, month, week, previousWeek, savingsRate, savingsTarget, safeToSpend, score, projectedExpense, projectedNet, weeklyChange, budgets, goals, recommendations };
}

export function planningAlerts(rows: Transaction[], plan: PlanningState, asOf: string, subscriptions: SubscriptionSummary[] = []): SpendingAlert[] {
  const m = planningMetrics(rows, plan, asOf);
  const alerts: SpendingAlert[] = [];
  if (plan.profile.spendingAlerts) {
    for (const b of m.budgets) {
      const threshold = [...plan.profile.alertThresholds].sort((a, b) => b - a).find(t => b.percent >= t);
      if (threshold !== undefined) alerts.push({ id: `budget:${asOf.slice(0, 7)}:${b.category}:${threshold}`, title: b.percent >= 100 ? "Overspending detected" : "Budget approaching limit", detail: `${b.name}: ${inr(b.spent)} of ${inr(b.limit)} (${b.percent.toFixed(0)}%).`, severity: b.percent >= 100 ? "critical" : "warning" });
    }
    for (const tx of rows.filter(tx => tx.date >= m.weekStart && tx.date <= asOf && tx.type === "debit" && !isTransfer(tx) && tx.amount >= plan.profile.largeTransactionLimit).slice(0, 10)) alerts.push({ id: `large:${tx.id}`, title: "Large expense", detail: `${tx.vendorClientName}: ${inr(tx.amount)} on ${tx.date}.`, severity: "warning" });
  }
  if (plan.profile.renewalReminders) for (const sub of subscriptions) {
    if (!sub.autoRenew || ["cancelled", "canceled", "inactive"].includes(sub.status.toLowerCase()) || !validDate(sub.renewalDate)) continue;
    const date = new Date(`${sub.renewalDate}T00:00:00Z`);
    const step = sub.billingCycle === "monthly" ? 1 : sub.billingCycle === "quarterly" ? 3 : sub.billingCycle === "annual" ? 12 : 0;
    const originalDay = date.getUTCDate();
    for (let n = 0; step && date.toISOString().slice(0, 10) < asOf && n < 120; n++) {
      date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + step);
      const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
      date.setUTCDate(Math.min(originalDay, last));
    }
    const renewal = date.toISOString().slice(0, 10);
    if (renewal >= asOf && renewal <= shiftDays(asOf, 7)) alerts.push({ id: `renewal:${sub.id}:${renewal}`, title: "Subscription renewal", detail: `${sub.name}: ${inr(sub.currentAmount)} expected ${renewal}.`, severity: "info" });
  }
  return alerts;
}
