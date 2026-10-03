/* Repository touch marker. */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Transaction } from "../src/types/finance.ts";
import {
  calendarDays,
  filterTransactions,
  spendingGroups,
  summarize,
} from "../src/lib/analyticsMath.ts";

const tx = (
  id: string,
  accountId: string,
  date: string,
  amount: number,
  type: Transaction["type"],
  extras: Partial<Transaction> = {},
): Transaction => ({
  id,
  accountId,
  date,
  amount,
  type,
  rawNarration: id,
  cleanedNarration: id,
  rail: "NEFT",
  accountNumber: accountId,
  bankName: accountId,
  category: "Other expense",
  categoryId: "other_expense",
  subCategory: "",
  vendorClientName: id,
  itcEligible: false,
  status: "categorized",
  confidence: 90,
  citation: { type: "rule", explanation: "Fixture", confidence: 90 },
  shareToken: "",
  ...extras,
});

test("filters include endpoint dates and isolate each bank and locked day", () => {
  const rows = [
    tx("a", "one", "2026-09-01", 1, "credit"),
    tx("b", "two", "2026-09-02", 2, "debit"),
    tx("c", "one", "2026-09-03", 3, "debit"),
  ];
  assert.deepEqual(
    filterTransactions(rows, {
      start: "2026-09-01",
      end: "2026-09-03",
      bankId: "one",
    }).map((r) => r.id),
    ["a", "c"],
  );
  assert.deepEqual(
    filterTransactions(rows, {
      start: "2026-09-01",
      end: "2026-09-03",
      bankId: "",
      date: "2026-09-02",
    }).map((r) => r.id),
    ["b"],
  );
});

test("paise sums exclude a paired contra movement once and retain decimal precision", () => {
  const rows = [
    tx("in", "one", "2026-09-20", 0.1, "credit"),
    tx("out", "one", "2026-09-20", 0.2, "debit", { recurring: true }),
    tx("contra-a", "one", "2026-09-20", 100, "debit", {
      transferId: "pair",
      rail: "INTERNAL",
    }),
    tx("contra-b", "two", "2026-09-20", 100, "credit", {
      transferId: "pair",
      rail: "INTERNAL",
    }),
  ];
  const all = summarize(rows);
  assert.equal(all.moneyInPaise, 10);
  assert.equal(all.moneyOutPaise, 20);
  assert.equal(all.recurringPaise, 20);
  assert.equal(all.transferCount, 1);
  assert.equal(all.transferLines, 2);
  assert.equal(all.transferPaise, 10000);
  assert.equal(
    summarize(rows.filter((r) => r.accountId === "one")).transferPaise,
    10000,
  );
});

test("duplicate exposure counts extra lines, while independent same-day amounts remain separate", () => {
  const rows = [
    tx("a", "one", "2026-09-20", 50, "debit", { bankRef: "ref" }),
    tx("b", "one", "2026-09-20", 50, "debit", { bankRef: "ref" }),
    tx("c", "one", "2026-09-20", 75, "debit"),
    tx("d", "two", "2026-09-20", 50, "debit"),
  ];
  const result = summarize(rows);
  assert.equal(result.duplicateCount, 2);
  assert.equal(result.duplicateExposurePaise, 5000);
  assert.deepEqual(spendingGroups(rows), [
    { name: "Other direct expenses", amountPaise: 22500 },
  ]);
});

test("heatmap weeks start Monday and span year boundaries", () => {
  const days = calendarDays("2025-12-31", "2026-01-02");
  assert.equal(days[0], "2025-12-29");
  assert.equal(days.at(-1), "2026-01-04");
  assert.equal(days.length, 7);
});
