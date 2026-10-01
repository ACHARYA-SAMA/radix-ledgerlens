import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { BankAccountSummary, BeneficiaryChange, SubscriptionSummary, Transaction } from "../types/finance.ts";
import { calendarDays, duplicateGroups, isRecurring, isTransfer, signedPaise, spendingGroups, summarize } from "./analyticsMath.ts";
import { cashFlowBuckets, type FlowBucket } from "./chartData.ts";

type RGB = [number, number, number];
type ReportInput = {
  rows: Transaction[];
  start: string;
  end: string;
  bankLabel: string;
  bankAccounts: BankAccountSummary[];
  subscriptions: SubscriptionSummary[];
  beneficiaryChanges: BeneficiaryChange[];
};

const ink: RGB = [23, 35, 43];
const muted: RGB = [99, 113, 123];
const teal: RGB = [25, 130, 112];
const amber: RGB = [204, 131, 48];
const blue: RGB = [87, 111, 171];
const red: RGB = [176, 82, 87];
const violet: RGB = [133, 105, 169];
const paper: RGB = [249, 250, 249];
const money = (paise: number) => `INR ${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const amount = (rupees: number) => `INR ${rupees.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const compactAmount = (rupees: number) => {
  const absolute = Math.abs(rupees);
  const sign = rupees < 0 ? "-" : "";
  if (absolute >= 10_000_000) return `${sign}${(absolute / 10_000_000).toFixed(2)} Cr`;
  if (absolute >= 100_000) return `${sign}${(absolute / 100_000).toFixed(1)} L`;
  if (absolute >= 1_000) return `${sign}${(absolute / 1_000).toFixed(1)}k`;
  return `${sign}${Math.round(absolute).toLocaleString("en-IN")}`;
};
const clean = (value: unknown) => String(value ?? "")
  .replace(/₹/g, "INR ")
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[–—]/g, "-")
  .replace(/[^\x20-\x7E]/g, " ")
  .replace(/\s+/g, " ").trim();
const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function matchesSubscription(sub: SubscriptionSummary, tx: Transaction) {
  if (signedPaise(tx) >= 0 || isTransfer(tx)) return false;
  const tokens = normalize(sub.vendorName).split(" ").filter(part => part.length >= 3 && !["and", "pvt", "ltd", "llp", "the"].includes(part));
  if (tokens.length < 2) return false;
  const party = normalize(`${tx.vendorClientName} ${tx.counterpartyText ?? ""} ${tx.rawNarration}`);
  return tokens.slice(0, 2).every(token => party.includes(token));
}
const fmt = (date: string) => date ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)) : "Unknown";

function text(doc: jsPDF, value: string, x: number, y: number, size = 9, color: RGB = ink, weight: "normal" | "bold" = "normal") {
  doc.setFont("helvetica", weight);
  doc.setFontSize(size);
  doc.setTextColor(...color);
  doc.text(clean(value), x, y);
}

function alignedText(doc: jsPDF, value: string, x: number, y: number, align: "center" | "right", size = 8, color: RGB = ink, weight: "normal" | "bold" = "normal") {
  doc.setFont("helvetica", weight);
  doc.setFontSize(size);
  doc.setTextColor(...color);
  doc.text(clean(value), x, y, { align });
}

function page(doc: jsPDF, title: string, start: string, end: string, bankLabel: string) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...paper);
  doc.rect(0, 0, w, 210, "F");
  doc.setFillColor(...ink);
  doc.rect(0, 0, w, 20, "F");
  text(doc, "LEDGERLENS  /  FINANCIAL ANALYTICS", 16, 12.5, 9, [255, 255, 255], "bold");
  text(doc, title, 16, 32, 18, ink, "bold");
  text(doc, `${fmt(start)} - ${fmt(end)}  |  ${bankLabel}`, 16, 39, 8, muted);
  doc.setDrawColor(221, 228, 229);
  doc.line(16, 43, w - 16, 43);
}

function section(doc: jsPDF, title: string, y: number) {
  text(doc, title.toUpperCase(), 16, y, 8, teal, "bold");
  doc.setDrawColor(210, 221, 222);
  doc.line(16, y + 3, 281, y + 3);
}

function metric(doc: jsPDF, x: number, y: number, width: number, label: string, value: string, detail: string, accent: RGB) {
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(220, 227, 229);
  doc.roundedRect(x, y, width, 28, 2.5, 2.5, "FD");
  doc.setFillColor(...accent);
  doc.rect(x, y, 1.5, 28, "F");
  text(doc, label.toUpperCase(), x + 5, y + 7, 7, muted, "bold");
  text(doc, value, x + 5, y + 17, 12, ink, "bold");
  text(doc, detail, x + 5, y + 23, 6.5, muted);
}

/** The export and the on-screen ComposedChart plot all three series on one signed rupee axis. */
export function flowChartDomain(buckets: FlowBucket[]) {
  const maximum = Math.max(0, ...buckets.flatMap(bucket => [bucket.moneyIn, bucket.moneyOut, bucket.moneyIn - bucket.moneyOut]));
  const minimum = Math.min(0, ...buckets.map(bucket => bucket.moneyIn - bucket.moneyOut));
  const span = Math.max(1, maximum - minimum);
  const rawStep = span / 4;
  const power = 10 ** Math.floor(Math.log10(rawStep));
  const factor = rawStep / power;
  const step = (factor <= 1 ? 1 : factor <= 2 ? 2 : factor <= 5 ? 5 : 10) * power;
  const top = Math.max(step, Math.ceil((maximum + span * .04) / step) * step);
  const bottom = minimum < 0 ? Math.floor((minimum - span * .04) / step) * step : 0;
  return { bottom, top, step };
}

function flowChart(doc: jsPDF, rows: Transaction[], start: string, end: string) {
  const buckets = cashFlowBuckets(rows, start, end);
  const totals = summarize(rows);
  const net = (totals.moneyInPaise - totals.moneyOutPaise) / 100;
  const cards: [string, string, RGB][] = [
    ["RECEIPTS", compactAmount(totals.moneyInPaise / 100), teal],
    ["PAYMENTS", compactAmount(totals.moneyOutPaise / 100), amber],
    ["NET MOVEMENT", `${net >= 0 ? "+" : ""}${compactAmount(net)}`, blue],
  ];
  cards.forEach(([label, value, color], index) => {
    const cardX = 16 + index * 90;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(219, 227, 229);
    doc.roundedRect(cardX, 57, 85, 23, 2, 2, "FD");
    doc.setFillColor(...color);
    doc.rect(cardX, 57, 1.5, 23, "F");
    text(doc, label, cardX + 5, 64, 7, muted, "bold");
    text(doc, `INR ${value}`, cardX + 5, 74, 12, ink, "bold");
  });
  text(doc, "Monthly receipts and payments are bars; the blue line is their difference on the same rupee scale.", 16, 87, 7.5, muted);

  const x = 42, y = 94, w = 234, h = 73;
  const { bottom, top, step } = flowChartDomain(buckets);
  const yFor = (value: number) => y + (top - value) / (top - bottom) * h;
  const zeroY = yFor(0);
  for (let tick = bottom; tick <= top + step / 10; tick += step) {
    const gy = yFor(tick);
    doc.setDrawColor(...(tick === 0 ? [135, 152, 164] as RGB : [220, 228, 229] as RGB));
    doc.setLineWidth(tick === 0 ? .42 : .18);
    doc.line(x, gy, x + w, gy);
    alignedText(doc, tick === 0 ? "0" : compactAmount(tick), x - 4, gy + 1.7, "right", 6.3, muted);
  }
  if (!buckets.length) {
    alignedText(doc, "No non-transfer cash movement in this range.", x + w / 2, y + 36, "center", 10, muted);
  } else {
    const slot = w / buckets.length;
    const barWidth = Math.max(1, Math.min(5, slot * .29));
    const points: [number, number][] = [];
    buckets.forEach((bucket, index) => {
      const cx = x + slot * (index + .5);
      ([{ value: bucket.moneyIn, color: teal, offset: -barWidth - .55 }, { value: bucket.moneyOut, color: amber, offset: .55 }] as const).forEach(bar => {
        const barTop = yFor(bar.value);
        const barHeight = zeroY - barTop;
        if (barHeight <= .15) return;
        doc.setFillColor(...bar.color);
        doc.roundedRect(cx + bar.offset, barTop, barWidth, barHeight, .8, .8, "F");
      });
      points.push([cx, yFor(bucket.moneyIn - bucket.moneyOut)]);
      if (buckets.length <= 18 || index % Math.ceil(buckets.length / 18) === 0) {
        alignedText(doc, bucket.label, cx, 175, "center", 6.5, muted);
      }
    });
    for (const [color, width] of [[paper, 1.65], [blue, .8]] as [RGB, number][]) {
      doc.setDrawColor(...color);
      doc.setLineWidth(width);
      points.slice(1).forEach((point, index) => doc.line(points[index][0], points[index][1], point[0], point[1]));
    }
    points.forEach(([px, py]) => {
      doc.setDrawColor(...blue);
      doc.setFillColor(255, 255, 255);
      doc.setLineWidth(.35);
      doc.circle(px, py, 1.15, "FD");
    });
  }
  doc.setLineWidth(.2);
  [[teal, "Money in"], [amber, "Money out"], [blue, "Net movement"]].forEach(([color, label], index) => {
    const lx = 16 + index * 45;
    doc.setFillColor(...color as RGB);
    doc.roundedRect(lx, 184, 4, 2.5, .6, .6, "F");
    text(doc, label as string, lx + 6, 186.3, 7, ink);
  });
  alignedText(doc, `${buckets.length} active periods`, 280, 186.3, "right", 7, muted);
  text(doc, `Total net: ${net >= 0 ? "+" : "-"}${money(Math.abs(totals.moneyInPaise - totals.moneyOutPaise))}. Internal transfers are excluded.`, 16, 194, 7.5, muted);
}

function categoryCharts(doc: jsPDF, rows: Transaction[]) {
  const categories = spendingGroups(rows);
  const total = categories.reduce((sum, c) => sum + c.amountPaise, 0);
  const colors: RGB[] = [teal, amber, blue, violet, red, [104, 150, 152], [184, 157, 102], [111, 123, 135]];
  const top = categories.slice(0, 7);
  const other = categories.slice(7).reduce((sum, c) => sum + c.amountPaise, 0);
  const slices = other ? [...top, { name: "Other categories", amountPaise: other }] : top;
  const cx = 72, cy = 105, radius = 40;
  let angle = -Math.PI / 2;
  if (total) slices.forEach((slice, index) => {
    const next = angle + slice.amountPaise / total * Math.PI * 2;
    doc.setFillColor(...colors[index % colors.length]);
    doc.setDrawColor(...colors[index % colors.length]);
    doc.setLineWidth(.18);
    for (let a = angle; a < next; a += .04) {
      const b = Math.min(next, a + .04);
      doc.triangle(cx, cy, cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, cx + Math.cos(b) * radius, cy + Math.sin(b) * radius, "FD");
    }
    angle = next;
  });
  doc.setLineWidth(.2);
  doc.setFillColor(...paper);
  doc.circle(cx, cy, 22, "F");
  text(doc, "TOTAL SPEND", cx - 17, cy - 3, 7, muted, "bold");
  text(doc, amount(total / 100), cx - 18, cy + 4, 8, ink, "bold");
  text(doc, "Category share", 16, 53, 9, ink, "bold");
  text(doc, "Non-transfer debits", 16, 59, 7, muted);
  text(doc, "Category amount and share", 137, 53, 9, ink, "bold");
  const max = Math.max(1, ...categories.map(c => c.amountPaise));
  categories.slice(0, 9).forEach((c, index) => {
    const y = 63 + index * 13;
    const color = colors[index % colors.length];
    text(doc, c.name.slice(0, 33), 137, y, 7.5, ink);
    text(doc, `${money(c.amountPaise)}  |  ${total ? (c.amountPaise / total * 100).toFixed(1) : "0"}%`, 229, y, 7, muted);
    doc.setFillColor(227, 233, 232);
    doc.roundedRect(137, y + 2, 133, 3.2, 1, 1, "F");
    doc.setFillColor(...color);
    doc.roundedRect(137, y + 2, 133 * c.amountPaise / max, 3.2, 1, 1, "F");
  });
  if (!categories.length) text(doc, "No non-transfer debits in this range.", 137, 68, 9, muted);
  return categories;
}

function activityChart(doc: jsPDF, rows: Transaction[], start: string, end: string) {
  const byDay = new Map<string, Transaction[]>();
  rows.forEach(tx => byDay.set(tx.date, [...(byDay.get(tx.date) ?? []), tx]));
  const days = calendarDays(start, end);
  const coveredDays = days.filter(day => day >= start && day <= end);
  const activeDays = coveredDays.filter(day => (byDay.get(day)?.length ?? 0) > 0).length;
  const duplicateIds = new Set(duplicateGroups(rows).flatMap(group => group.map(tx => tx.id)));
  const riskDays = coveredDays.filter(day => byDay.get(day)?.some(tx => tx.status === "flagged_fraud" || tx.isDuplicate || duplicateIds.has(tx.id))).length;
  const busiest = [...byDay].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0];
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, index) => ({
    label,
    value: rows.filter(tx => (new Date(`${tx.date}T00:00:00Z`).getUTCDay() + 6) % 7 === index).length,
  }));
  const peakWeekday = Math.max(1, ...weekday.map(day => day.value));

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(219, 227, 229);
  doc.roundedRect(16, 57, 265, 62, 2, 2, "FD");
  text(doc, "One square = one calendar day. Darker teal means more statement lines on that date.", 21, 65, 8, ink);
  const weeks = Math.max(1, Math.ceil(days.length / 7));
  const column = Math.min(4.45, 233 / weeks);
  const cellWidth = Math.max(1, column - .65);
  const left = 40, top = 78, rowStep = 4.3;
  ["M", "T", "W", "T", "F", "S", "S"].forEach((label, index) => {
    alignedText(doc, label, 33, top + index * rowStep + 2.7, "center", 6.2, muted, "bold");
  });
  let lastMonthX = -100;
  days.forEach((day, index) => {
    if (day > end) return;
    if (index !== 0 && !day.endsWith("-01")) return;
    const x = left + Math.floor(index / 7) * column;
    const label = index === 0 || day.endsWith("-01") && day.slice(5, 7) === "01"
      ? `${new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`))} ${day.slice(2, 4)}`
      : new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
    if (x - lastMonthX >= (label.length > 4 ? 15 : 10)) {
      text(doc, label, x, 74, 6.5, muted, "bold");
      lastMonthX = x;
    }
  });
  const heatColors: RGB[] = [[232, 237, 236], [192, 220, 211], [133, 194, 177], [65, 153, 129], [22, 111, 94]];
  const levelFor = (count: number) => count >= 8 ? 4 : count >= 5 ? 3 : count >= 3 ? 2 : count >= 1 ? 1 : 0;
  days.forEach((day, i) => {
    const transactions = byDay.get(day) ?? [];
    const count = transactions.length;
    const outside = day < start || day > end;
    const px = left + Math.floor(i / 7) * column;
    const py = top + (i % 7) * rowStep;
    doc.setFillColor(...(outside ? [244, 246, 246] as RGB : heatColors[levelFor(count)]));
    doc.roundedRect(px, py, cellWidth, 3.65, .5, .5, "F");
    if (!outside && transactions.some(tx => tx.status === "flagged_fraud" || tx.isDuplicate || duplicateIds.has(tx.id))) {
      doc.setFillColor(...red);
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(.25);
      doc.circle(px + cellWidth - .55, py + .55, .67, "FD");
    }
  });
  text(doc, "LINES PER DAY", 21, 114, 6.6, muted, "bold");
  ["0", "1-2", "3-4", "5-7", "8+"].forEach((label, index) => {
    const px = 64 + index * 20;
    doc.setFillColor(...heatColors[index]);
    doc.roundedRect(px, 110.4, 4, 4, .5, .5, "F");
    text(doc, label, px + 5.5, 113.7, 6.4, muted);
  });
  doc.setFillColor(...red);
  doc.circle(221, 112.4, 1.1, "F");
  text(doc, "Risk or duplicate flag", 225, 114, 6.7, muted);

  const summary: [string, string, string, RGB][] = [
    ["ACTIVE DAYS", `${activeDays} / ${coveredDays.length}`, "Days with one or more lines", teal],
    ["STATEMENT LINES", rows.length.toLocaleString("en-IN"), "Across selected banks", ink],
    ["BUSIEST DATE", busiest ? fmt(busiest[0]) : "None", busiest ? `${busiest[1].length} lines on that day` : "No activity in range", amber],
    ["DAYS TO REVIEW", String(riskDays), "With risk or duplicate flag", red],
  ];
  summary.forEach(([label, value, detail, accent], index) => {
    const x = 16 + index * 67;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(219, 227, 229);
    doc.roundedRect(x, 124, 63, 24, 2, 2, "FD");
    doc.setFillColor(...accent);
    doc.rect(x, 124, 1.3, 24, "F");
    text(doc, label, x + 4, 130, 6.5, muted, "bold");
    text(doc, value, x + 4, 139, 10, ink, "bold");
    text(doc, detail, x + 4, 144.5, 6.1, muted);
  });

  section(doc, "Weekday activity profile", 154);
  text(doc, "Total statement lines for each weekday in this date range; taller stacks mean busier days.", 16, 164, 7.2, muted);
  const busiestWeekday = weekday.reduce((best, current) => current.value > best.value ? current : best, weekday[0]);
  alignedText(doc, `${busiestWeekday.label} is busiest`, 280, 164, "right", 7.5, teal, "bold");
  weekday.forEach((day, index) => {
    const cx = 36 + index * 38;
    const active = day.value ? Math.max(1, Math.round(day.value / peakWeekday * 7)) : 0;
    alignedText(doc, String(day.value), cx, 172, "center", 9, ink, "bold");
    for (let segment = 0; segment < 7; segment++) {
      doc.setFillColor(...(segment < active ? index > 4 ? amber : teal : [225, 232, 232] as RGB));
      doc.roundedRect(cx - 8, 186 - segment * 1.7, 16, 1.3, .35, .35, "F");
    }
    alignedText(doc, day.label.toUpperCase(), cx, 194, "center", 7.5, index === 4 ? teal : muted, index === 4 ? "bold" : "normal");
  });
}

function table(doc: jsPDF, head: string[], body: string[][], startY: number, widths?: Record<number, number>) {
  autoTable(doc, {
    startY,
    margin: { left: 16, right: 16, top: 25, bottom: 15 },
    head: [head], body,
    styles: { font: "helvetica", fontSize: 7, cellPadding: 2.1, textColor: ink, lineColor: [230, 235, 235], lineWidth: .1, overflow: "linebreak" },
    headStyles: { fillColor: ink, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 248, 247] },
    columnStyles: widths ? Object.fromEntries(Object.entries(widths).map(([key, cellWidth]) => [key, { cellWidth }])) : undefined,
  });
}

/** Builds a selectable, multi-page report for every transaction in the chosen range. */
export function buildAnalyticsPdf(input: ReportInput): jsPDF {
  const { start, end, bankLabel, bankAccounts, subscriptions, beneficiaryChanges } = input;
  const rows = [...input.rows].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const stats = summarize(rows);
  const fraudRows = rows.filter(tx => tx.status === "flagged_fraud");
  const duplicateIds = new Set(duplicateGroups(rows).flatMap(group => group.map(tx => tx.id)));
  const rowIds = new Set(rows.map(tx => tx.id));
  const alerts = beneficiaryChanges.filter(a => a.transactionIds?.some(id => rowIds.has(id)) || (bankLabel === "All banks" && a.changeDate.slice(0, 10) >= start && a.changeDate.slice(0, 10) <= end));
  const relevantSubscriptions = subscriptions.filter(sub => rows.some(tx => tx.subscriptionId === sub.id || matchesSubscription(sub, tx)));
  const subscriptionIds = new Set(rows.filter(tx => subscriptions.some(sub => matchesSubscription(sub, tx))).map(tx => tx.id));
  const recurringRows = rows.filter(tx => signedPaise(tx) < 0 && (isRecurring(tx) || subscriptionIds.has(tx.id)));
  const recurringPaise = recurringRows.reduce((sum, tx) => sum + Math.abs(signedPaise(tx)), 0);
  const operationalRows = rows.filter(tx => signedPaise(tx) < 0 && !isTransfer(tx) && !["salary_payment", "tax_payment", "loan_repayment", "personal"].includes(tx.categoryId ?? ""));
  const operationalTotal = operationalRows.reduce((sum, tx) => sum + Math.abs(signedPaise(tx)), 0);
  const operationalRecurring = operationalRows.filter(tx => isRecurring(tx) || subscriptionIds.has(tx.id)).reduce((sum, tx) => sum + Math.abs(signedPaise(tx)), 0);

  page(doc, "Financial overview", start, end, bankLabel);
  section(doc, "Six pillars / selected statements", 51);
  const cards: [string, string, string, RGB][] = [
    ["Money in", money(stats.moneyInPaise), `${stats.inCount} credits; transfers excluded`, teal],
    ["Money out", money(stats.moneyOutPaise), `${stats.outCount} debits; transfers excluded`, amber],
    ["Internal transfers", money(stats.transferPaise), `${stats.transferCount} pairs; ${stats.transferLines} lines`, blue],
    ["Recurring", money(recurringPaise), `${recurringRows.length} recurring debits`, violet],
    ["Duplicates", `${stats.duplicateCount} lines`, `${money(stats.duplicateExposurePaise)} possible exposure`, amber],
    ["Fraud flags", `${stats.fraudCount} flagged`, `${alerts.length} beneficiary alerts`, red],
  ];
  cards.forEach(([label, value, detail, color], i) => metric(doc, 16 + (i % 3) * 90, 58 + Math.floor(i / 3) * 33, 85, label, value, detail, color));
  section(doc, "Operational spending mix", 136);
  text(doc, `Recurring ${money(operationalRecurring)}`, 16, 148, 8, violet, "bold");
  text(doc, `One-off ${money(operationalTotal - operationalRecurring)}`, 112, 148, 8, muted, "bold");
  doc.setFillColor(224, 231, 231);
  doc.roundedRect(16, 155, 265, 8, 2, 2, "F");
  if (operationalRecurring > 0) {
    doc.setFillColor(...violet);
    doc.roundedRect(16, 155, 265 * operationalRecurring / operationalTotal, 8, 2, 2, "F");
  }
  text(doc, `${rows.length.toLocaleString("en-IN")} statement lines across ${new Set(rows.map(tx => tx.date)).size} active days and ${new Set(rows.map(tx => tx.accountId ?? tx.accountNumber)).size} accounts.`, 16, 177, 8, muted);
  text(doc, "The complete matching ledger, with narration and status, follows the visual report.", 16, 184, 8, muted);
  doc.addPage();
  page(doc, "Cash movement", start, end, bankLabel);
  section(doc, "Money in vs. money out", 51);
  flowChart(doc, rows, start, end);

  doc.addPage();
  page(doc, "Spending composition", start, end, bankLabel);
  section(doc, "Category distribution", 46);
  const categories = categoryCharts(doc, rows);
  if (categories.length > 9) {
    text(doc, `${categories.length - 9} smaller categories are included in the complete category table.`, 137, 186, 7, muted);
  }

  doc.addPage();
  page(doc, "Statement activity", start, end, bankLabel);
  section(doc, "Statement activity heatmap", 51);
  activityChart(doc, rows, start, end);

  doc.addPage();
  page(doc, "Supporting detail", start, end, bankLabel);
  section(doc, "All spending categories", 51);
  table(doc, ["Category", "Amount", "Share of spend"], categories.map(c => [clean(c.name), money(c.amountPaise), `${(c.amountPaise / Math.max(1, stats.moneyOutPaise) * 100).toFixed(1)}%`]), 57);
  doc.addPage();
  page(doc, "Account breakdown", start, end, bankLabel);
  section(doc, "Matching bank statements", 51);
  table(doc, ["Bank / account", "Purpose", "Lines", "Money in", "Money out", "Internal transfers", "Source opening", "Latest recorded balance"],
    bankAccounts.filter(account => rows.some(tx => tx.accountId === account.id)).map(account => {
      const accountRows = rows.filter(tx => tx.accountId === account.id);
      const stat = summarize(accountRows);
      const latest = [...accountRows].sort((a, b) => a.date.localeCompare(b.date) || (a.lineNo ?? 0) - (b.lineNo ?? 0)).at(-1);
      return [
        `${clean(account.bank)} ${clean(account.accountLast4)}`,
        clean(account.purpose),
        String(accountRows.length),
        money(stat.moneyInPaise),
        money(stat.moneyOutPaise),
        money(stat.transferPaise),
        amount(account.openingBalance),
        latest?.runningBalance == null ? "Not supplied" : `${amount(latest.runningBalance)} (${latest.date})`,
      ];
    }), 57);
  doc.addPage();
  page(doc, "Subscriptions and risk", start, end, bankLabel);
  section(doc, "Recurring records matched to selected lines", 51);
  table(doc, ["Vendor", "Plan", "Cycle", "Expected per cycle", "Status"], relevantSubscriptions.map(s => [clean(s.vendorName), clean(s.name), clean(s.billingCycle), amount(s.currentAmount), clean(s.status)]), 57);
  doc.addPage();
  page(doc, "Flags and beneficiary changes", start, end, bankLabel);
  section(doc, "Flagged transactions", 51);
  table(doc, ["Date", "Counterparty", "Amount", "Reason", "Status"], fraudRows.map(tx => [tx.date, clean(tx.vendorClientName), money(Math.abs(signedPaise(tx))), clean(tx.fraudWarning?.reason ?? tx.notes ?? "Flagged for review"), clean(tx.status)]), 57);
  doc.addPage();
  page(doc, "Beneficiary changes", start, end, bankLabel);
  section(doc, "Linked or dated alerts in the chosen range", 51);
  table(doc, ["Changed", "Vendor", "Old account", "New account", "Penny drop", "Payout status"], alerts.map(a => [a.changeDate.slice(0, 10), clean(a.vendorName), clean(a.oldAccount), clean(a.newAccount), clean(a.pennyDropStatus), clean(a.activeStatus)]), 57);

  doc.addPage();
  page(doc, "Complete statement ledger", start, end, bankLabel);
  text(doc, `${rows.length.toLocaleString("en-IN")} lines; all matching rows are listed below, including transfers and flagged entries.`, 16, 49, 8, muted);
  table(doc,
    ["Date / ID", "Account / rail", "Counterparty / narration", "Category / subcategory", "Signed amount", "Status / evidence"],
    rows.map(tx => [
      `${tx.date}\n${clean(tx.id)}`,
      `${clean(tx.bankName)} ${clean(tx.accountNumber)}\n${clean(tx.rail)}${tx.bankRef ? ` / ${clean(tx.bankRef)}` : ""}`,
      `${clean(tx.vendorClientName)}\n${clean(tx.rawNarration || tx.cleanedNarration)}`,
      `${clean(tx.category)}${tx.subCategory ? ` / ${clean(tx.subCategory)}` : ""}${isTransfer(tx) ? "\nInternal transfer" : ""}`,
      `${signedPaise(tx) >= 0 ? "+" : "-"}${money(Math.abs(signedPaise(tx)))}`,
      `${clean(tx.status)}${tx.isDuplicate || duplicateIds.has(tx.id) ? " / possible duplicate" : ""}${tx.gstin ? `\nGSTIN ${clean(tx.gstin)}` : ""}`,
    ]), 55, { 0: 32, 1: 44, 2: 72, 3: 55, 4: 30, 5: 32 });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFillColor(...ink);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 20, "F");
    text(doc, "LEDGERLENS  /  FINANCIAL ANALYTICS", 16, 12.5, 9, [255, 255, 255], "bold");
    doc.setDrawColor(217, 225, 226);
    doc.line(16, 201, 281, 201);
    text(doc, "Statement-derived analysis  |  Possible duplicates and fraud flags require review.", 16, 206, 6.5, muted);
    text(doc, `${i} / ${pages}`, 270, 206, 6.5, muted);
  }
  return doc;
}
