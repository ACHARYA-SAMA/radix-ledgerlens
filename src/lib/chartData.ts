import type { Transaction } from "../types/finance.ts";
import { isTransfer, signedPaise } from "./analyticsMath.ts";

export interface FlowBucket {
  key: string;
  label: string;
  moneyIn: number;
  moneyOut: number;
}

/** Period totals follow the same non-transfer rules as the analytics summary. */
export function cashFlowBuckets(rows: Transaction[], start: string, end: string): FlowBucket[] {
  if (!start || !end || start > end) return [];
  const spanDays = Math.max(1, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1);
  const period: "day" | "week" | "month" = spanDays <= 21 ? "day" : spanDays <= 100 ? "week" : "month";
  const buckets = new Map<string, FlowBucket>();
  for (const tx of rows) {
    if (isTransfer(tx)) continue;
    const signed = signedPaise(tx);
    if (!signed) continue;
    let key = tx.date;
    if (period === "month") key = tx.date.slice(0, 7);
    if (period === "week") {
      const date = new Date(`${tx.date}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      key = date.toISOString().slice(0, 10);
    }
    const label = period === "month"
      ? new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`))
      : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${key}T00:00:00Z`));
    const bucket = buckets.get(key) ?? { key, label, moneyIn: 0, moneyOut: 0 };
    if (signed > 0) bucket.moneyIn += signed / 100;
    else bucket.moneyOut += -signed / 100;
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
}
