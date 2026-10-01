import assert from "node:assert/strict";
import test from "node:test";
import { INITIAL_TRANSACTIONS } from "../src/data/mockTransactions.ts";
import { filterTransactions } from "../src/lib/analyticsMath.ts";
import { buildAnalyticsPdf, flowChartDomain } from "../src/lib/analyticsPdf.ts";

test("PDF cash movement shares a signed scale for bars and net line", () => {
  const buckets = [
    { key: "2026-08", label: "Aug 26", moneyIn: 500_000, moneyOut: 900_000 },
    { key: "2026-09", label: "Sep 26", moneyIn: 1_200_000, moneyOut: 800_000 },
  ];
  const { bottom, top, step } = flowChartDomain(buckets);
  assert.ok(bottom < -400_000);
  assert.ok(top > 1_200_000);
  assert.ok(step > 0);
});

test("analytics PDF includes every row in the selected dates and bank, plus report pages", () => {
  const transactions = INITIAL_TRANSACTIONS.map((tx, index) => ({
    ...tx,
    accountId: index % 2 ? "bank-b" : "bank-a",
  }));
  const start = "2026-09-25";
  const end = "2026-09-29";
  const rows = filterTransactions(transactions, { start, end, bankId: "bank-a" });
  const report = buildAnalyticsPdf({
    rows, start, end, bankLabel: "Bank A 1928",
    bankAccounts: [], subscriptions: [], beneficiaryChanges: [],
  });
  const ledger = (report as typeof report & { lastAutoTable: { body: { cells: Record<number, { text: string[] }> }[] } }).lastAutoTable;
  assert.ok(report.getNumberOfPages() >= 9);
  assert.equal(ledger.body.length, rows.length);
  const ledgerIds = ledger.body.map(row => row.cells[0].text.join(" "));
  for (const row of rows) assert.ok(ledgerIds.some(value => value.includes(row.id)));
  for (const row of transactions.filter(row => !rows.includes(row))) {
    assert.ok(ledgerIds.every(value => !value.includes(row.id)));
  }
  const header = Buffer.from(report.output("arraybuffer")).subarray(0, 5).toString();
  assert.equal(header, "%PDF-");
});
