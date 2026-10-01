import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDataset, analyze } from "../server/engine.ts";
import { Store } from "../server/store.ts";
const accounts = [
  { id: "a", bank: "Bank A", opening_balance: 100, account_last4: "1234" },
  { id: "b", bank: "Bank B", opening_balance: 200 },
];
const row = (
  id: string,
  account: string,
  debit: number,
  credit: number,
  text = "unknown",
) => ({
  id,
  account_id: account,
  debit,
  credit,
  raw_narration: text,
  counterparty_text: text,
  value_date: "2026-09-20",
  line_no: 1,
});
test("source evidence precedes rules and captures invoice; paise amounts remain exact", () => {
  const out = buildDataset({
    "bank-accounts": accounts,
    "bank-transactions": [
      row("x", "a", 0, 0.1, "SAL GST"),
      row("y", "a", 0, 0.2),
    ],
    payments: [
      { id: "p", bank_transaction_id: "x", invoice_id: "i", client_id: "c" },
    ],
  });
  assert.equal(out.transactions[0].categoryId, "customer_receipt");
  assert.match(out.transactions[0].citation.sourceDocument!, /payments\/p/);
  assert.match(out.transactions[0].citation.explanation, /i/);
  assert.equal(analyze(out.transactions, accounts).inflowThisMonth, 0.3);
});
test("pairs only unambiguous opposite movements across owned accounts", () => {
  const out = buildDataset({
    "bank-accounts": accounts,
    "bank-transactions": [
      row("x", "a", 10, 0),
      row("y", "b", 0, 10),
      row("z", "a", 2, 0),
      row("w", "a", 0, 2),
    ],
  });
  assert.equal(out.transactions.filter((t) => t.transferId).length, 2);
  assert.equal(out.analytics.inflowThisMonth, 2);
  assert.equal(out.analytics.outflowThisMonth, 2);
  const ambiguous = buildDataset({
    "bank-accounts": accounts,
    "bank-transactions": [
      row("x", "a", 10, 0),
      row("y", "b", 0, 10),
      row("z", "b", 0, 10),
    ],
  });
  assert.equal(ambiguous.transactions.filter((t) => t.transferId).length, 0);
});
test("saved human corrections survive rebuild; empty references are not duplicates", () => {
  const out = buildDataset(
    {
      "bank-accounts": accounts,
      "bank-transactions": [row("x", "a", 1, 0), row("y", "a", 2, 0)],
    },
    [{ id: "x", category: "rent", pattern: "unknown", action: "correct" }],
  );
  assert.equal(out.transactions[0].categoryId, "rent");
  assert.equal(out.transactions[0].citation.type, "human");
  assert.equal(out.transactions[1].categoryId, "rent");
  assert.equal(out.transactions[0].duplicateIds?.length ?? 0, 0);
});
test("beneficiary warnings require a payment after the change within the configured window", () => {
  const data = {
    "bank-accounts": accounts,
    "bank-transactions": [row("x", "a", 100, 0)],
    "vendor-bank-accounts": [{ id: "vba", vendor_id: "v", verified: false }],
    vendors: [{ id: "v", name: "Vendor" }],
    "vendor-payments": [
      {
        id: "p",
        bank_transaction_id: "x",
        beneficiary_account_id: "vba",
        vendor_id: "v",
        amount: 100,
        status: "success",
        initiated_at: "2026-09-20T12:00:00Z",
      },
    ],
    "master-data-changes": [
      {
        id: "ch",
        entity_type: "vendor_bank_account",
        entity_id: "vba",
        changed_at: "2026-09-18T12:00:00Z",
      },
    ],
  };
  assert.equal(buildDataset(data).transactions[0].status, "flagged_fraud");
  data["master-data-changes"][0].changed_at = "2026-09-21T12:00:00Z";
  assert.equal(buildDataset(data).beneficiaryChanges.length, 0);
});
test("SQLite state is scoped by team and atomic writes roll back on failure", () => {
  const store = new Store(":memory:");
  store.setTeam("one");
  store.put("review", "x", { category: "rent" });
  store.setTeam("two");
  assert.equal(store.get("review", "x"), null);
  store.setTeam("one");
  assert.deepEqual(store.get("review", "x"), { category: "rent" });
  assert.throws(() =>
    store.atomic(() => {
      store.put("review", "x", { category: "tax" });
      throw Error("fail");
    }),
  );
  assert.deepEqual(store.get("review", "x"), { category: "rent" });
  store.close();
});
test("accepted transfer remains paired after rebuild and does not teach all SELF transactions", () => {
  const data = {
    "bank-accounts": accounts,
    "bank-transactions": [
      row("x", "a", 10, 0, "SELF"),
      row("y", "b", 0, 10, "SELF"),
      row("z", "a", 3, 0, "SELF"),
    ],
  };
  const out = buildDataset(data, [
    {
      id: "x",
      category: "internal_transfer",
      action: "accept",
      pattern: "self",
    },
  ]);
  assert.equal(out.transactions.filter((t) => t.transferId).length, 2);
  assert.equal(out.analytics.inflowThisMonth, 0);
  assert.equal(out.analytics.outflowThisMonth, 3);
  assert.equal(
    out.transactions.find((t) => t.id === "z")?.categoryId,
    "uncategorized",
  );
});
test("unique payroll evidence precedes accidental equal debit/credit transfer match", () => {
  const out = buildDataset({
    "bank-accounts": accounts,
    "bank-transactions": [row("x", "a", 10, 0), row("y", "b", 0, 10)],
    "payroll-runs": [
      { id: "p", account_id: "a", pay_date: "2026-09-20", net: 10 },
    ],
  });
  assert.equal(out.transactions[0].categoryId, "salary_payment");
  assert.equal(out.transactions[0].transferId, undefined);
});
test("human decision conflicting with explicit source stays in review with both pieces of evidence", () => {
  const out = buildDataset(
    {
      "bank-accounts": accounts,
      "bank-transactions": [row("x", "a", 0, 10)],
      payments: [{ id: "p", bank_transaction_id: "x" }],
    },
    [{ id: "x", category: "rent", action: "correct" }],
  );
  assert.equal(out.transactions[0].status, "needs_review");
  assert.match(out.transactions[0].citation.explanation, /conflict/i);
  assert.match(out.transactions[0].citation.explanation, /payments\/p/);
});
