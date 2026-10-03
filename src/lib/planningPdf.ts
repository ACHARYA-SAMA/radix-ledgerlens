import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { AppState } from "../types/finance.ts";
import { planningMetrics, planningAlerts, type CoachReport } from "../../shared/planning.ts";
import { BANK_SYNC_LABEL, displayText } from "../../shared/branding.ts";

const clean = (value: string) => displayText(value).replace(/₹/g, "INR ").replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[^\x20-\x7e\n]/g, " ");
const money = (n: number) => `INR ${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function buildPlanningPdf(state: AppState, coach?: CoachReport) {
  if (!state.planning || !state.dataDate) throw new Error("Sync your bank feed before exporting a plan.");
  const plan = state.planning;
  const m = planningMetrics(state.transactions, plan, state.dataDate);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const heading = (title: string, subtitle: string) => {
    doc.setFillColor(14, 29, 31); doc.rect(0, 0, 210, 37, "F");
    doc.setTextColor(151, 220, 192); doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("LEDGERLENS / PERSONAL FINANCIAL INTELLIGENCE", 16, 12);
    doc.setTextColor(255, 255, 255); doc.setFontSize(21); doc.text(title, 16, 25);
    doc.setTextColor(86, 102, 108); doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text(clean(subtitle), 16, 46);
  };
  const table = (head: string[], body: string[][], y: number) => autoTable(doc, { head: [head], body: body.map(row => row.map(clean)), startY: y, margin: { left: 16, right: 16, top: 18, bottom: 18 }, styles: { font: "helvetica", fontSize: 9, cellPadding: 3, overflow: "linebreak", textColor: [30, 48, 52] }, headStyles: { fillColor: [35, 92, 79], textColor: [255, 255, 255] }, alternateRowStyles: { fillColor: [243, 248, 245] } });
  const paragraph = (content: string, y: number, size = 10) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(size); doc.setTextColor(40, 58, 63);
    for (const line of doc.splitTextToSize(clean(content), 177) as string[]) {
      if (y > 274) { doc.addPage(); y = 22; }
      doc.text(line, 16, y); y += size * 0.47;
    }
    return y + 5;
  };
  heading("Your financial plan", `${plan.profile.name} | Statement period ${m.monthStart} to ${m.asOf}`);
  paragraph(`Bank data: ${BANK_SYNC_LABEL}. ${state.importedTransactionCount ?? state.transactions.length} imported records and ${state.liveTransactionCount ?? 0} live entries.`, 56, 9);
  table(["Monthly measure", "Current position"], [
    ["Income received", money(m.month.income)], ["Expenses (excluding internal transfers)", money(m.month.expense)], ["Net savings", money(m.month.savings)], ["Savings rate / target", `${m.savingsRate.toFixed(1)}% / ${plan.profile.savingsTargetPct}%`], ["Income target", money(plan.profile.monthlyIncomeTarget)], ["Daily safe-to-spend", money(m.safeToSpend)], ["Savings health", `${m.score} / 100`], ["Month-end net cash-flow estimate", money(m.projectedNet)],
  ], 73);
  let y = (doc as any).lastAutoTable.finalY + 12;
  y = paragraph("Safe-to-spend reserves the savings target and uses received income capped at the income target. Savings health measures target coverage and budget compliance. The cash-flow estimate assumes the recorded daily pace continues; it is not a guaranteed balance.", y, 9);
  if (plan.starterPlan) paragraph("Starter plan: saved goal balances are illustrative. Edit them or clear the starter balances before using this plan to represent your actual savings. Allocations do not move money.", y, 9);

  doc.addPage(); heading("Goals & milestones", `Progress through ${m.asOf} | Allocations are planning records`);
  table(["Goal", "Saved / target", "Progress", "Target date", "Needed / month"], m.goals.map(g => [g.name, `${money(g.saved)} / ${money(g.target)}`, `${g.percent.toFixed(0)}%`, `${g.targetDate}${g.overdue ? " (past due)" : ""}`, money(g.monthlyNeeded)]), 57);
  doc.addPage(); heading("Category budgets", `${m.monthStart} to ${m.asOf} | Live expenses included`);
  table(["Category", "Monthly limit", "Actual spend", "Used", "Status"], m.budgets.map(b => [b.name, money(b.limit), money(b.spent), `${b.percent.toFixed(0)}%`, b.percent >= 100 ? "Overspending" : b.percent >= 80 ? "Approaching limit" : "On track"]), 57);
  y = (doc as any).lastAutoTable.finalY + 12;
  paragraph(`Alert preferences: ${plan.profile.alertThresholds.join("%, ")}% of budget; large expense threshold ${money(plan.profile.largeTransactionLimit)}. Spending alerts ${plan.profile.spendingAlerts ? "on" : "off"}; renewal reminders ${plan.profile.renewalReminders ? "on" : "off"}; voice alerts ${plan.profile.voiceAlerts ? "on" : "off"}.`, y, 9);
  doc.addPage(); heading("Your financial insights", `${coach?.source ?? "Built-in analysis"} | Figures as of ${m.asOf}`);
  y = paragraph(`Last seven days (${m.weekStart} to ${m.asOf}): ${money(m.week.income)} income, ${money(m.week.expense)} expenses, ${money(m.week.savings)} net savings. Month to date: ${money(m.month.income)} income and ${money(m.month.expense)} expenses.`, 59);
  if (coach) { y = paragraph(coach.summary, y); if (coach.warning) y = paragraph(coach.warning, y, 9); }
  for (const [i, recommendation] of (coach?.recommendations ?? m.recommendations).entries()) y = paragraph(`${i + 1}. ${recommendation}`, y);
  const alerts = planningAlerts(state.transactions, plan, m.asOf, state.subscriptions);
  doc.addPage(); heading("Spending & renewal alerts", `Configured preferences | Statement date ${m.asOf}`);
  table(["Alert", "Detail", "Priority"], alerts.length ? alerts.map(a => [a.title, a.detail, a.severity]) : [["All caught up", "No alerts under the current preferences.", "Info"]], 57);
  const count = doc.getNumberOfPages();
  for (let i = 1; i <= count; i++) {
    doc.setPage(i); doc.setDrawColor(213, 224, 221); doc.line(16, 283, 194, 283);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(93, 111, 113);
    doc.text("LedgerLens | Statement-based planning | INR", 16, 289); doc.text(`${i} / ${count}`, 194, 289, { align: "right" });
  }
  doc.setProperties({ title: "LedgerLens - Goals & Budget Report", subject: BANK_SYNC_LABEL, author: "LedgerLens" });
  return doc;
}
