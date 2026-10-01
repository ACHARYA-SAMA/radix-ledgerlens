import { test } from "node:test";
import assert from "node:assert/strict";
import { analyticsAnswer } from "../server/analyticsAnswers.ts";
import { questionDates } from "../server/questionDates.ts";
import type { AppState, Transaction } from "../src/types/finance.ts";

function transaction(id: string, date: string, amount: number, type: "credit" | "debit", transfer = false): Transaction {
  return {
    id, date, amount, type, signedPaise: Math.round(amount * 100) * (type === "credit" ? 1 : -1),
    transferId: transfer ? "own" : undefined, rail: transfer ? "INTERNAL" : "NEFT",
    categoryId: transfer ? "internal_transfer" : type === "credit" ? "customer_receipt" : "vendor_payment",
    category: transfer ? "Internal transfer" : type === "credit" ? "Customer receipt" : "Vendor payment",
    vendorClientName: id, rawNarration: id, citation: { type: "rule", explanation: "Test transaction", confidence: 100 },
    status: "categorized", accountId: "bank-1",
  } as Transaction;
}
const rows = [
  transaction("opening", "2025-09-26", 1000, "credit"),
  transaction("client", "2026-09-28", 1000, "credit"),
  transaction("supplier", "2026-09-28", 250, "debit"),
  transaction("own-transfer", "2026-09-28", 500, "debit", true),
  transaction("latest", "2026-09-29", 25, "credit"),
];
const state = {
  transactions: rows,
  analytics: { cashTimeline: [{ date: "2025-09-26", balance: 1000 }, { date: "2026-09-28", balance: 1750 }, { date: "2026-09-29", balance: 1775 }] },
} as AppState;

test("spoken dates and ranges select the requested statement days", () => {
  assert.deepEqual(questionDates("on 25th September 2025"), { start: "2025-09-25", end: "2025-09-25" });
  assert.deepEqual(questionDates("on September 28, 2026"), { start: "2026-09-28", end: "2026-09-28" });
  assert.deepEqual(questionDates("from 2026-09-28 to 2026-09-29"), { start: "2026-09-28", end: "2026-09-29" });
  assert.match(analyticsAnswer("What was cash flow on 31 September 2026?", state)!, /valid date/);
});

test("out-of-range cash-flow questions do not use the latest cash position", () => {
  const answer = analyticsAnswer("What is the cash flow on 25th September 2025?", state)!;
  assert.match(answer, /don't have bank statement data for 25 September 2025/);
  assert.match(answer, /26 September 2025 through 29 September 2026/);
  assert.doesNotMatch(answer, /cash position|1775/);
});

test("dated cash movement matches Analytics totals and excludes internal transfers", () => {
  const answer = analyticsAnswer("What was cash flow on 28 September 2026?", state)!;
  assert.match(answer, /1 thousand rupees in and 250 rupees out/);
  assert.match(answer, /net inflow of 750 rupees/);
  assert.doesNotMatch(answer, /500 rupees/);
  assert.match(analyticsAnswer("What was cash balance on 28 September 2026?", state)!, /1.8 thousand rupees/);
});

test("relative periods and the latest transaction use imported records", () => {
  assert.match(analyticsAnswer("total inflow and outflow cash this week", state)!, /1 thousand rupees in and 250 rupees out/);
  assert.match(analyticsAnswer("cashflow this month", state)!, /1 thousand rupees in and 250 rupees out/);
  assert.match(analyticsAnswer("latest transaction", state)!, /latest.*25 rupees on 29 September 2026/);
});
