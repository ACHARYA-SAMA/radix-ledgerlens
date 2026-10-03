/* Repository touch marker. */
import type { Transaction } from "../types/finance.ts";

export const paise = (rupees: number) => Math.round(rupees * 100);
export const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
export const utcDate = (date: string) => new Date(`${date}T00:00:00Z`);
export const shiftDays = (date: string, days: number) => {
  const result = utcDate(date);
  result.setUTCDate(result.getUTCDate() + days);
  return dateOnly(result);
};
export const signedPaise = (tx: Transaction) =>
  tx.signedPaise ?? paise(tx.amount) * (tx.type === "credit" ? 1 : -1);
/** Imported closing balances plus the separate live overlay, even for backdated live entries. */
export function accountClosingPaise(rows: Transaction[], openingRupees: number) {
  const imported = rows.filter(tx => !tx.origin).sort((a, b) => a.date.localeCompare(b.date) || (a.lineNo ?? 0) - (b.lineNo ?? 0) || a.id.localeCompare(b.id));
  let balance = paise(openingRupees);
  for (const tx of imported) balance = tx.runningBalance == null ? balance + signedPaise(tx) : paise(tx.runningBalance);
  return balance + rows.filter(tx => tx.origin).reduce((sum, tx) => sum + signedPaise(tx), 0);
}
export const isTransfer = (tx: Transaction) =>
  tx.isInternalTransfer === true ||
  !!tx.transferId ||
  tx.rail === "INTERNAL" ||
  tx.categoryId === "internal_transfer" ||
  /internal transfer/i.test(tx.category);
export const isRecurring = (tx: Transaction) =>
  tx.isRecurring === true ||
  tx.recurring === true ||
  !!tx.subscriptionId ||
  tx.citation.type === "historical_pattern" ||
  /subscription|cloud/i.test(tx.category);

export interface Filters {
  start: string;
  end: string;
  bankId: string;
  date?: string | null;
}
export function filterTransactions(rows: Transaction[], filter: Filters) {
  return rows.filter(
    (tx) =>
      tx.date >= filter.start &&
      tx.date <= filter.end &&
      (!filter.bankId || tx.accountId === filter.bankId) &&
      (!filter.date || tx.date === filter.date),
  );
}

// Explicit duplicate references and statement collisions form connected groups.
// Values are possible exposure, never a claim that a payment was prevented.
export function duplicateGroups(rows: Transaction[]) {
  const byId = new Map(rows.map((tx) => [tx.id, tx]));
  const parent = new Map(rows.map((tx) => [tx.id, tx.id]));
  const find = (id: string): string => {
    const p = parent.get(id)!;
    if (p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    if (byId.has(a) && byId.has(b)) parent.set(find(b), find(a));
  };
  const collision = new Map<string, string>();
  for (const tx of rows) {
    for (const peer of tx.duplicateIds ?? []) union(tx.id, peer);
    const account = tx.accountId ?? `${tx.bankName}:${tx.accountNumber}`;
    const amount = signedPaise(tx);
    const keys = [
      `${account}:${tx.date}:${amount}`,
      tx.bankRef ? `${account}:ref:${tx.bankRef}` : "",
      tx.chequeNo ? `${account}:cheque:${tx.chequeNo}` : "",
      tx.rawNarration.trim()
        ? `${account}:${tx.date}:${amount}:text:${tx.rawNarration.trim().toLowerCase()}`
        : "",
    ];
    for (const key of keys.filter(Boolean)) {
      const previous = collision.get(key);
      if (previous) union(tx.id, previous);
      else collision.set(key, tx.id);
    }
  }
  const groups = new Map<string, Transaction[]>();
  for (const tx of rows) {
    const root = find(tx.id);
    groups.set(root, [...(groups.get(root) ?? []), tx]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

export function summarize(rows: Transaction[]) {
  let moneyInPaise = 0;
  let moneyOutPaise = 0;
  let recurringPaise = 0;
  let inCount = 0;
  let outCount = 0;
  let fraudPaise = 0;
  let fraudCount = 0;
  let transferLines = 0;
  let recurringCount = 0;
  let pendingCount = 0;
  const transfers = new Map<string, number>();
  for (const tx of rows) {
    const signed = signedPaise(tx);
    if (tx.status === "needs_review" || tx.status === "flagged_fraud")
      pendingCount++;
    if (tx.status === "flagged_fraud") {
      fraudCount++;
      fraudPaise += Math.abs(signed);
    }
    if (isTransfer(tx)) {
      transferLines++;
      if (tx.transferId)
        transfers.set(
          tx.transferId,
          Math.max(transfers.get(tx.transferId) ?? 0, Math.abs(signed)),
        );
      continue;
    }
    if (signed > 0) {
      moneyInPaise += signed;
      inCount++;
    } else if (signed < 0) {
      moneyOutPaise -= signed;
      outCount++;
      if (isRecurring(tx)) {
        recurringPaise -= signed;
        recurringCount++;
      }
    }
  }
  const duplicates = duplicateGroups(rows);
  return {
    moneyInPaise,
    moneyOutPaise,
    inCount,
    outCount,
    transferLines,
    transferCount: transfers.size,
    transferPaise: [...transfers.values()].reduce((n, value) => n + value, 0),
    recurringPaise,
    recurringCount,
    duplicateCount:
      new Set(duplicates.flatMap((group) => group.map((t) => t.id))).size +
      rows.filter(
        (tx) =>
          tx.isDuplicate && !duplicates.some((group) => group.includes(tx)),
      ).length,
    duplicateExposurePaise: duplicates.reduce(
      (total, group) =>
        total +
        group.slice(1).reduce((n, tx) => n + Math.abs(signedPaise(tx)), 0),
      0,
    ),
    fraudCount,
    fraudPaise,
    pendingCount,
  };
}

const categoryNames: Record<string, string> = {
  vendor_payment: "Vendor payments / procurement",
  software: "Subscriptions & cloud SaaS",
  salary_payment: "Salaries & payroll",
  tax_payment: "Statutory taxes",
  loan_repayment: "Loan EMIs & debt service",
  travel: "Freight, transport & travel",
  professional_fees: "Professional services",
  other_expense: "Other direct expenses",
  bank_charges: "Bank charges & fees",
  rent: "Rent",
  utilities: "Utilities",
  insurance: "Insurance",
  personal: "Personal drawings",
  uncategorized: "Uncategorized",
};
export function spendingGroups(rows: Transaction[]) {
  const totals = new Map<string, number>();
  for (const tx of rows) {
    if (signedPaise(tx) >= 0 || isTransfer(tx)) continue;
    const label =
      categoryNames[tx.categoryId ?? ""] ?? tx.category ?? "Uncategorized";
    totals.set(label, (totals.get(label) ?? 0) + Math.abs(signedPaise(tx)));
  }
  return [...totals]
    .map(([name, amountPaise]) => ({ name, amountPaise }))
    .sort((a, b) => b.amountPaise - a.amountPaise);
}

export function calendarDays(start: string, end: string) {
  if (!start || !end || start > end) return [];
  const first = utcDate(start);
  first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  const last = utcDate(end);
  last.setUTCDate(last.getUTCDate() + ((7 - last.getUTCDay()) % 7));
  const days: string[] = [];
  for (let day = first; day <= last; day.setUTCDate(day.getUTCDate() + 1))
    days.push(dateOnly(day));
  return days;
}
