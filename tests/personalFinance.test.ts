import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { Store } from "../server/store.ts";
import { LedgerService } from "../server/service.ts";
import { NovaClient } from "../server/nova.ts";
import { Gemini } from "../server/gemini.ts";
import { buildDataset, finalizeTrace } from "../server/engine.ts";
import { createApp } from "../server/app.ts";
import { addLiveTransaction, getPlanning, updatePlanning, financialCoach } from "../server/personalFinance.ts";
import { planningMetrics, planningAlerts } from "../shared/planning.ts";
import { displayText, BANK_SYNC_LABEL } from "../shared/branding.ts";
import { buildPlanningPdf } from "../src/lib/planningPdf.ts";
import { accountClosingPaise } from "../src/lib/analyticsMath.ts";

function fixture(path = ":memory:") {
  const store = new Store(path); store.setTeam("test:one");
  const nova = new NovaClient({ key: "test", fetch: async () => Response.json({}) });
  const service = new LedgerService(store, nova, new Gemini({ key: "" }));
  service.ready = true;
  service.sources = {
    "bank-accounts": [{ id: "icici", bank: "ICICI", account_last4: "5328", opening_balance: 1000 }],
    "bank-transactions": [
      { id: "income", account_id: "icici", value_date: "2026-09-29", debit: 0, credit: 150000, raw_narration: "INCOME", counterparty_text: "Salary", running_balance: 151000 },
      { id: "expense", account_id: "icici", value_date: "2026-09-29", debit: 7500, credit: 0, raw_narration: "SHOPPING", counterparty_text: "Shopping", running_balance: 143500 },
    ],
  };
  const result = buildDataset(service.sources);
  result.transactions.forEach(finalizeTrace);
  result.transactions.find(t => t.id === "expense")!.categoryId = "personal";
  result.transactions.find(t => t.id === "expense")!.category = "Personal drawing";
  service.snapshot = { ...result, syncedAt: "2026-09-30", warnings: [] };
  store.put("snapshot", "current", service.snapshot); store.put("sources", "current", service.sources);
  const plan = getPlanning(service); plan.budgets = [{ category: "personal", limit: 10000 }]; store.put("planning", "current", plan);
  return service;
}
const payment = (overrides: Record<string, unknown> = {}) => ({ requestId: "one", merchant: "Test merchant", amount: 3000, direction: "debit", accountId: "icici", date: "2026-09-29", category: "personal", rail: "UPI", ...overrides });

test("live intake is additive, immediately updates analytics/voice and alerts, and deduplicates retries", () => {
  const service = fixture();
  try {
    const original = JSON.stringify(service.snapshot);
    const before = service.state(); let events = 0; service.events.on("changed", () => events++);
    const first = addLiveTransaction(service, payment(), "phone");
    const state = service.state();
    assert.equal(state.transactions.length, 3);
    assert.equal(state.transactions[0].id, first.id);
    assert.equal(state.importedTransactionCount, 2);
    assert.equal(state.liveTransactionCount, 1);
    assert.equal(JSON.stringify(service.snapshot), original);
    assert.equal(JSON.stringify(service.store.get("snapshot", "current")), original);
    assert.equal(state.analytics.cashPosition, before.analytics.cashPosition - 3000);
    const metrics = planningMetrics(state.transactions, state.planning!, state.dataDate!);
    assert.equal(metrics.month.expense, 10500); assert.equal(metrics.budgets[0].percent, 105);
    assert.ok(planningAlerts(state.transactions, state.planning!, state.dataDate!).some(a => a.title === "Overspending detected"));
    assert.match(service.ask("What is the latest transaction?").answer, /Test merchant/);
    assert.match(service.ask("What are my budgets?").answer, /over budget/);
    assert.equal(addLiveTransaction(service, payment(), "phone").duplicate, true);
    assert.equal(service.state().transactions.length, 3); assert.equal(events, 1);
    assert.throws(() => addLiveTransaction(service, payment({ amount: 3001 }), "phone"), /different transaction/);
  } finally { service.store.close(); }
});

test("live rows and planning survive a restart, remain team-scoped, and do not alter the import", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ledgerlens-planning-")); const file = join(dir, "test.sqlite");
  let service = fixture(file);
  try {
    const original = JSON.stringify(service.snapshot);
    addLiveTransaction(service, payment(), "n8n");
    updatePlanning(service, { action: "allocate", revision: 0, id: "emergency", amount: 1250 });
    service.store.close();
    const nova = new NovaClient({ key: "test" }); nova.health = async () => ({ status: "ok" }); nova.me = async () => ({ id: "identity", team_slot: "test", dataset_slice: "one" });
    service = new LedgerService(new Store(file), nova, new Gemini({ key: "" })); await service.initialize();
    assert.equal(service.state().transactions.length, 3);
    assert.equal(service.state().planning!.goals[0].saved, 86250);
    assert.equal(JSON.stringify(service.snapshot), original);
    nova.listBankAccounts = async () => { throw new Error("Offline"); }; await service.sync();
    assert.equal(service.state().transactions.length, 3);
    nova.me = async () => ({ id: "identity", team_slot: "another", dataset_slice: "two" }); await service.initialize();
    assert.equal(service.state().liveTransactionCount, 0); assert.equal(service.state().transactions.length, 0);
  } finally { service.store.close(); rmSync(dir, { recursive: true }); }
});

test("successful bank resync preserves separate live entries", async () => {
  const service = fixture();
  try {
    addLiveTransaction(service, payment(), "phone");
    const sources = structuredClone(service.sources);
    service.nova.health = async () => ({ status: "ok" });
    service.nova.me = async () => ({ id: "identity", team_slot: "test", dataset_slice: "one" });
    service.nova.listBankAccounts = async () => sources["bank-accounts"];
    service.nova.listBankTransactions = async () => sources["bank-transactions"];
    service.nova.list = async () => [];
    await service.sync();
    assert.equal(service.snapshot!.transactions.length, 2);
    assert.equal(service.state().transactions.length, 3);
  } finally { service.store.close(); }
});

test("goal contributions are atomic, retry-safe, and excluded from expense budgets", () => {
  const service = fixture();
  try {
    const request = payment({ category: "internal_transfer", goalId: "emergency", amount: 1000 });
    const result = addLiveTransaction(service, request, "phone");
    addLiveTransaction(service, request, "phone");
    const state = service.state();
    assert.equal(state.planning!.goals[0].saved, 86000);
    assert.equal(planningMetrics(state.transactions, state.planning!, state.dataDate!).month.expense, 7500);
    assert.throws(() => addLiveTransaction(service, payment({ requestId: "two", goalId: "emergency" }), "phone"), /internal-transfer/);
    assert.throws(() => addLiveTransaction(service, payment({ requestId: "three", category: "internal_transfer", goalId: "missing" }), "phone"), /Goal unavailable/);
    assert.equal(service.state().transactions.length, 3);
    service.review(result.id, { action: "correct", category: "personal" });
    assert.equal(service.transaction(result.id).isInternalTransfer, false);
    assert.equal(service.state().liveTransactionCount, 1);
  } finally { service.store.close(); }
});

test("validation rejects malformed input and stale edits without partial writes", () => {
  const service = fixture();
  try {
    for (const change of [{ amount: 0 }, { amount: -10 }, { amount: 1.111 }, { amount: "2" }, { date: "2026-02-30" }, { category: "invented" }, { accountId: "missing" }, { merchant: "" }, { rail: "bad" }, { direction: "income" }]) assert.throws(() => addLiveTransaction(service, payment(change), "phone"));
    assert.equal(service.state().transactions.length, 2);
    assert.throws(() => updatePlanning(service, { action: "budget", revision: 0, category: "personal", limit: 0 }));
    updatePlanning(service, { action: "budget", revision: 0, category: "personal", limit: 15000 });
    assert.throws(() => updatePlanning(service, { action: "budget", revision: 0, category: "personal", limit: 1 }), /changed in another window/);
    const profile = service.state().planning!.profile;
    assert.throws(() => updatePlanning(service, { action: "profile", revision: 1, profile: { ...profile, alertThresholds: [NaN] } }));
    assert.equal(service.state().planning!.budgets[0].limit, 15000);
  } finally { service.store.close(); }
});

test("backdated live entries remain in account balances after later imported closing balances", () => {
  const service = fixture();
  try {
    const before = accountClosingPaise(service.state().transactions, 1000);
    addLiveTransaction(service, payment({ date: "2026-09-01", amount: 100.25 }), "phone");
    const after = service.state();
    assert.equal(accountClosingPaise(after.transactions, 1000), before - 10025);
    assert.equal(Math.round(after.analytics.cashPosition * 100), before - 10025);
  } finally { service.store.close(); }
});

test("profile alert toggles, zero income, statement periods and renewal reminders are respected", () => {
  const service = fixture();
  try {
    const plan = getPlanning(service);
    const metrics = planningMetrics([], plan, "2026-09-29");
    assert.equal(metrics.safeToSpend, 0); assert.equal(metrics.savingsRate, 0); assert.ok(Number.isFinite(metrics.projectedNet));
    plan.profile.spendingAlerts = false;
    plan.profile.renewalReminders = true;
    const subscriptions = [{ id: "sub", name: "Workspace", vendorName: "Cloud", billingCycle: "monthly", currentAmount: 100, renewalDate: "2026-08-31", autoRenew: true, status: "active" }];
    const alerts = planningAlerts(service.state().transactions, plan, "2026-09-29", subscriptions);
    assert.equal(alerts.length, 1); assert.match(alerts[0].detail, /2026-09-30/);
    plan.profile.renewalReminders = false;
    assert.deepEqual(planningAlerts(service.state().transactions, plan, "2026-09-29", subscriptions), []);
  } finally { service.store.close(); }
});

test("AI failures use clearly labeled computed summaries and planning PDF retains all goals", async () => {
  const service = fixture();
  try {
    service.gemini.key = "test"; service.gemini.json = async () => { throw new Error("Unavailable"); };
    const report = await financialCoach(service);
    assert.equal(report.source, "Built-in analysis"); assert.ok(report.warning); assert.match(report.summary, /Month to date/);
    const state = service.state(); state.planning!.profile.name = "Aczen Nova";
    const doc = buildPlanningPdf(state, report);
    const pdf = doc.output().replaceAll("\\(", "(").replaceAll("\\)", ")");
    assert.ok(doc.getNumberOfPages() >= 5); assert.ok(pdf.includes(BANK_SYNC_LABEL)); assert.ok(!/\b(?:Aczen|Nova)\b/i.test(pdf));
    for (const goal of state.planning!.goals) assert.ok(pdf.includes(goal.name));
    assert.equal(state.planning!.profile.name, "Aczen Nova");
    assert.equal(displayText("Nova unavailable; ACZEN status"), `${BANK_SYNC_LABEL} unavailable; ${BANK_SYNC_LABEL} status`);
    service.gemini.json = async () => ({ summary: "Spending is within the current category limits.", recommendations: ["Review recurring software charges before renewal."] });
    assert.equal((await financialCoach(service)).source, "Gemini");
    service.gemini.json = async () => ({ summary: "Incomplete" });
    assert.equal((await financialCoach(service)).source, "Built-in analysis");
  } finally { service.store.close(); }
});

test("anonymous phone/webhook intake and metadata-only SSE coexist with authenticated financial data", async () => {
  const service = fixture();
  const server = createApp(service, undefined, async token => token === "valid").listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const abort = new AbortController();
  try {
    assert.equal((await fetch(`${base}/api/state`)).status, 401);
    assert.equal((await fetch(`${base}/api/planning`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 401);
    assert.equal((await fetch(`${base}/api/live-config`)).status, 200);
    const stream = await fetch(`${base}/api/live-events`, { signal: abort.signal }); const reader = stream.body!.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value), /event: ready/);
    const response = await fetch(`${base}/api/webhook/n8n`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transaction: payment() }) });
    assert.equal(response.status, 201);
    const event = new TextDecoder().decode((await reader.read()).value);
    assert.match(event, /event: changed/); assert.ok(!event.includes("merchant")); assert.ok(!event.includes("3000"));
    const state = await (await fetch(`${base}/api/state`, { headers: { Authorization: "Bearer valid" } })).json();
    assert.equal(state.transactions.length, 3);
    assert.equal((await fetch(`${base}/api/live-transaction`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://untrusted.example" }, body: JSON.stringify(payment()) })).status, 403);
    assert.equal((await fetch(`${base}/api/live-transaction`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" })).status, 400);
    await reader.cancel();
  } finally { abort.abort(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); service.store.close(); }
});
