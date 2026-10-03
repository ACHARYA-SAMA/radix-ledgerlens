/* Repository touch marker. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cashFlowBuckets } from "../src/lib/chartData.ts";
import type { Transaction } from "../src/types/finance.ts";

const row = (date: string, signedPaise: number, transfer = false) => ({
  date, signedPaise, rail: transfer ? "INTERNAL" : "NEFT", category: transfer ? "Internal transfer" : "Vendor payment",
}) as Transaction;

test("cash-flow charts use rupees, exclude internal transfers, and follow the selected period", () => {
  const rows = [row("2026-09-29", 125050), row("2026-09-29", -5010), row("2026-09-29", -900000, true), row("2026-10-01", -250000)];
  assert.deepEqual(cashFlowBuckets(rows, "2026-09-29", "2026-10-02").map(({ key, moneyIn, moneyOut }) => ({ key, moneyIn, moneyOut })), [
    { key: "2026-09-29", moneyIn: 1250.5, moneyOut: 50.1 },
    { key: "2026-10-01", moneyIn: 0, moneyOut: 2500 },
  ]);
  assert.deepEqual(cashFlowBuckets(rows, "2026-09-01", "2026-12-31").map(({ key, moneyIn, moneyOut }) => ({ key, moneyIn, moneyOut })), [
    { key: "2026-09", moneyIn: 1250.5, moneyOut: 50.1 },
    { key: "2026-10", moneyIn: 0, moneyOut: 2500 },
  ]);
});
