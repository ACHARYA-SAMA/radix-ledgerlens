import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { Store } from "../server/store.ts";
import { LedgerService } from "../server/service.ts";
import { Gemini } from "../server/gemini.ts";
import { NovaClient } from "../server/nova.ts";
import { buildDataset, finalizeTrace } from "../server/engine.ts";
import { addLiveTransaction, getPlanning, updatePlanning } from "../server/personalFinance.ts";
import { enrichLearning, receiveLearningCallback } from "../server/memory.ts";
import { adaptiveMetrics, spendMix } from "../shared/memory.ts";
import { inQuietHours, planningAlerts } from "../shared/planning.ts";
import { createApp } from "../server/app.ts";
import { LIVE_PIPELINE_STAGES } from "../shared/memory.ts";
import { streamMemory } from "../src/lib/memoryStream.ts";

function fixture(path = ":memory:") {
  const store = new Store(path); store.setTeam("memory:one");
  const service = new LedgerService(store, new NovaClient({ key: "test" }), new Gemini({ key: "" }));
  service.ready = true;
  service.sources = { "bank-accounts": [{ id: "bank", bank: "Test", account_last4: "1234" }], "bank-transactions": [
    { id: "income", account_id: "bank", value_date: "2026-09-01", debit: 0, credit: 60000, raw_narration: "salary", counterparty_text: "Employer" },
    ...["01", "05", "10"].map((day, i) => ({ id: `expense-${i}`, account_id: "bank", value_date: `2026-09-${day}`, debit: 1000, credit: 0, raw_narration: "Cafe", counterparty_text: "Cafe" })),
  ] };
  const dataset = buildDataset(service.sources);
  for (const tx of dataset.transactions) { if (tx.type === "debit") { tx.categoryId = "personal"; tx.category = "Personal drawing"; } finalizeTrace(tx); }
  service.snapshot = { ...dataset, syncedAt: "2026-09-10", warnings: [] }; service.save();
  const plan = getPlanning(service); plan.budgets = [{ category: "personal", limit: 8000 }, { category: "travel", limit: 20000 }, { category: "rent", limit: 100000 }];
  store.put("planning", "current", plan); service.state();
  return service;
}
const payment = (extra: Record<string, unknown> = {}) => ({ requestId: "memory-payment", merchant: "Cafe", amount: 2000, direction: "debit", accountId: "bank", date: "2026-09-10", category: "personal", rail: "UPI", ...extra });
const noN8n = () => { const previous = process.env.N8N_INBOUND_WEBHOOK_URL; delete process.env.N8N_INBOUND_WEBHOOK_URL; return () => { if (previous === undefined) delete process.env.N8N_INBOUND_WEBHOOK_URL; else process.env.N8N_INBOUND_WEBHOOK_URL = previous; }; };

test("memory compares with prior visits, persists all layers and preserves the imported snapshot", () => {
  const dir = mkdtempSync(join(tmpdir(), "ledger-memory-")); const path = join(dir, "memory.sqlite");
  const service = fixture(path);
  try {
    const snapshot = JSON.stringify(service.snapshot);
    const first = addLiveTransaction(service, payment(), "phone");
    const context = service.store.get<any>("learning-context", first.id);
    assert.equal(context.merchantVisitCount, 3); assert.equal(context.merchantAvgSpend, 1000);
    assert.equal(context.categoryDailyBurnRate, 300); assert.equal(context.projectedMonthEndSpend, 9000);
    const memory = service.state().memory!;
    assert.equal(memory.merchantHistory.find(m => m.name === "Cafe")!.visitCount, 4);
    assert.match(memory.learningUpdates[0].observedPattern, /100% above/);
    assert.equal(memory.learningUpdates[0].velocityForecast!.projectedMonthEndSpend, 15000);
    assert.equal(memory.learningUpdates[0].velocityForecast!.exhaustionDate, "2026-09-16");
    assert.equal(JSON.stringify(service.snapshot), snapshot);
    assert.equal(JSON.stringify(service.store.get("snapshot", "current")), snapshot);
    addLiveTransaction(service, payment(), "phone"); assert.equal(service.state().memory!.learningUpdates.length, 1);
    const reopened = new Store(path); reopened.setTeam("memory:one"); assert.equal(reopened.memory()!.learningUpdates[0].transactionId, first.id);
    reopened.setTeam("other"); assert.equal(reopened.memory(), null); reopened.close();
  } finally { service.store.close(); rmSync(dir, { recursive: true }); }
});

test("human merchant preferences apply to later live expenses, never to transfers or income", () => {
  const service = fixture();
  try {
    const tx = addLiveTransaction(service, payment(), "phone");
    service.review(tx.id, { action: "correct", category: "travel" });
    const next = addLiveTransaction(service, payment({ requestId: "second", merchant: "  CAFE  " }), "phone");
    assert.equal(service.transaction(next.id).categoryId, "travel");
    assert.ok(service.state().memory!.learnedTraits.some(t => t.kind === "preference" && t.text.includes("Travel")));
    const transfer = addLiveTransaction(service, payment({ requestId: "third", category: "internal_transfer" }), "phone");
    assert.equal(service.transaction(transfer.id).categoryId, "internal_transfer");
    const credit = addLiveTransaction(service, payment({ requestId: "fourth", direction: "credit", category: "other_income" }), "phone");
    assert.equal(service.transaction(credit.id).categoryId, "other_income");
  } finally { service.store.close(); }
});

test("rebalance protects fixed categories, conserves total limits, rejects stale actions; sweeps reserve available savings", () => {
  const service = fixture();
  try {
    addLiveTransaction(service, payment(), "phone");
    const state = service.state(); const plan = state.planning!;
    const metrics = adaptiveMetrics(state.transactions, plan, state.dataDate!);
    const suggestion = metrics.rebalances[0]; assert.equal(suggestion.fromCategory, "travel");
    const total = plan.budgets.reduce((s, b) => s + b.limit, 0);
    const updated = updatePlanning(service, { action: "rebalance", revision: plan.revision, ...suggestion, amount: suggestion.suggestedAmount });
    assert.equal(updated.planning!.budgets.reduce((s, b) => s + b.limit, 0), total);
    assert.equal(updated.planning!.budgets.find(b => b.category === "personal")!.limit, 15000);
    assert.throws(() => updatePlanning(service, { action: "rebalance", revision: plan.revision, ...suggestion, amount: suggestion.suggestedAmount }), /changed/);
    const m = adaptiveMetrics(updated.transactions, updated.planning!, updated.dataDate!);
    const swept = updatePlanning(service, { action: "micro-sweep", revision: updated.planning!.revision, id: m.topGoal!.id, amount: m.microSweepAmount });
    assert.equal(swept.planning!.allocationsByMonth!["2026-09"], m.microSweepAmount);
    assert.equal(adaptiveMetrics(swept.transactions, swept.planning!, swept.dataDate!).availableToAllocate, m.availableToAllocate - m.microSweepAmount);
  } finally { service.store.close(); }
});

test("n8n receives pre-transaction context without auth headers and cannot override ledger-derived calculations", async () => {
  const restore = noN8n(); process.env.N8N_INBOUND_WEBHOOK_URL = "https://workflow.example/webhook/learning";
  const service = fixture();
  try {
    const tx = addLiveTransaction(service, payment(), "phone"); let calls = 0;
    await enrichLearning(service, tx.id, "phone", async (_url, init) => {
      calls++; const payload = JSON.parse(init!.body as string);
      assert.equal(payload.transaction.id, tx.id); assert.equal(payload.memorySnapshot.merchantVisitCount, 3);
      assert.ok(payload.memorySnapshot.activeBudgets.length); assert.ok(payload.memorySnapshot.activeGoals.length);
      assert.equal(new Headers(init!.headers).has("Authorization"), false);
      return Response.json({ transactionId: tx.id, learningUpdate: { explanation: "Your recent Cafe purchase is above your historical average.", velocityForecast: { projectedMonthEndSpend: 999999 }, rebalanceSuggestion: { suggestedAmount: 999999 } } });
    });
    assert.equal(calls, 3);
    const update = service.state().memory!.learningUpdates[0];
    assert.equal(update.source, "n8n"); assert.equal(update.velocityForecast!.projectedMonthEndSpend, 15000);
    assert.notEqual(update.rebalanceSuggestion!.suggestedAmount, 999999);
  } finally { restore(); service.store.close(); }
});

test("absent n8n goes directly to Gemini, malformed AI falls back without losing the live entry", async () => {
  const restore = noN8n(); const service = fixture();
  try {
    service.gemini.key = "test"; let calls = 0;
    service.gemini.learning = async () => { calls++; return { learningUpdate: { explanation: "Cafe spending increased relative to your prior visits." } }; };
    const tx = addLiveTransaction(service, payment(), "phone");
    await enrichLearning(service, tx.id, "phone", async () => { throw new Error("Should not contact n8n"); });
    assert.equal(calls, 1); assert.equal(service.state().memory!.learningUpdates[0].source, "Gemini");
    service.gemini.learning = async () => ({ learningUpdate: { explanation: 123 } });
    const next = addLiveTransaction(service, payment({ requestId: "another" }), "n8n");
    await enrichLearning(service, next.id, "n8n");
    assert.equal(service.state().memory!.learningUpdates[0].source, "Built-in analysis");
    assert.equal(service.state().memory!.learningUpdates[0].pipeline!.status, "fallback");
    assert.equal(service.state().liveTransactionCount, 2);
  } finally { restore(); service.store.close(); }
});

test("n8n timeout aborts at 3.5 seconds and engages Gemini fallback", async () => {
  const restore = noN8n(); process.env.N8N_INBOUND_WEBHOOK_URL = "https://workflow.example/slow";
  const service = fixture();
  try {
    service.gemini.key = "test"; service.gemini.learning = async () => ({ learningUpdate: { explanation: "Saved context is sufficient to explain the recent purchase." } });
    const tx = addLiveTransaction(service, payment(), "n8n"); let signal: AbortSignal | null = null;
    const started = performance.now();
    await enrichLearning(service, tx.id, "n8n", async (_url, init) => { signal = init!.signal!; return new Promise<Response>(() => {}); });
    assert.ok(performance.now() - started < 5000); assert.equal((signal as AbortSignal | null)?.aborted, true);
    assert.equal(service.state().memory!.learningUpdates[0].source, "Gemini");
  } finally { restore(); service.store.close(); }
});

test("callbacks are retry-safe, reject unknown entries and cannot undo a human correction", () => {
  const service = fixture();
  try {
    const tx = addLiveTransaction(service, payment(), "phone");
    const body = { transactionId: tx.id, learningUpdate: { explanation: "Repeated Cafe visits suggest reviewing your discretionary spending." } };
    assert.equal(receiveLearningCallback(service, body).duplicate, false);
    const revision = service.state().memory!.revision;
    assert.equal(receiveLearningCallback(service, body).duplicate, true);
    assert.equal(service.state().memory!.revision, revision);
    assert.throws(() => receiveLearningCallback(service, { ...body, transactionId: "missing" }), /unavailable/);
    assert.throws(() => receiveLearningCallback(service, { ...body, learningUpdate: { explanation: "short" } }), /10–1200/);
    service.review(tx.id, { action: "correct", category: "travel" });
    assert.throws(() => receiveLearningCallback(service, body), /human reviewed/);
  } finally { service.store.close(); }
});

test("public live streams and callbacks reveal only the intended live state", async () => {
  const restore = noN8n(); const service = fixture();
  const server = createApp(service, undefined, async token => token === "valid").listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const abort = new AbortController();
  try {
    const stream = await fetch(`${base}/api/live-stream`, { signal: abort.signal });
    const reader = stream.body!.getReader(); const initial = new TextDecoder().decode((await reader.read()).value);
    assert.match(initial, /event: update/); assert.match(initial, /merchantHistory/);
    assert.equal((await fetch(`${base}/api/transactions`)).status, 200);
    const receipt = await (await fetch(`${base}/api/live-transaction`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payment()) })).json();
    const callback = await fetch(`${base}/api/webhook/n8n`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transactionId: receipt.id, learningUpdate: { explanation: "Review repeated merchant spending against your latest monthly plan." } }) });
    assert.equal(callback.status, 200); const body = await callback.json(); assert.equal(body.status, "learning_updated"); assert.equal(body.memory, undefined);
    const next = new TextDecoder().decode((await reader.read()).value); assert.match(next, /learningUpdates/);
    await reader.cancel();
  } finally { restore(); abort.abort(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); service.store.close(); }
});

test("importable n8n workflow builds context, validates model output and returns local fallback on failure", () => {
  const flow = JSON.parse(readFileSync(new URL("../workflows/ledgerlens-memory.n8n.json", import.meta.url), "utf8"));
  assert.equal(flow.nodes[0].parameters.authentication, "none");
  assert.equal(flow.nodes[0].parameters.responseMode, "responseNode");
  const build = new Function("$input", flow.nodes.find((n: any) => n.name === "Build memory request").parameters.jsCode);
  const context = build({ first: () => ({ json: { body: { event: "ledgerlens.learning.request", version: 1, transaction: { id: "one" }, memorySnapshot: { merchantVisitCount: 3 }, learningUpdate: { observedPattern: "Local history", velocityForecast: null } } } }) });
  assert.match(context[0].json.request.contents[0].parts[0].text, /merchantVisitCount/);
  const validate = new Function("$input", "$", flow.nodes.find((n: any) => n.name === "Validate learning response").parameters.jsCode);
  const good = validate({ first: () => ({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify({ learningUpdate: { explanation: "Repeated purchases warrant a review of the budget." } }) }] } }] } }) }, () => ({ first: () => context[0] }));
  assert.equal(good[0].json.fallback, false); assert.equal(good[0].json.learningUpdate.observedPattern, "Local history");
  const fallback = validate({ first: () => ({ json: { error: "timeout" } }) }, () => ({ first: () => context[0] }));
  assert.equal(fallback[0].json.fallback, true); assert.equal(fallback[0].json.learningUpdate.explanation, undefined);
});

test("Spend Mix intervals, quiet hours and additional profile preferences use stable dates", () => {
  const service = fixture();
  try {
    const state = service.state();
    assert.equal(spendMix(state.transactions, "2026-09-10", "weekly").items[0].value, 2000);
    assert.equal(spendMix(state.transactions, "2026-09-10", "monthly").items[0].value, 3000);
    assert.equal(spendMix(state.transactions, "2026-09-10", "yearly").start, "2026-01-01");
    const plan = state.planning!;
    const profile = { ...plan.profile, defaultSpendPeriod: "yearly", priorityGoalId: "travel", renewalLeadDays: 14, quietHoursEnabled: true, quietHoursStart: "22:00", quietHoursEnd: "08:00", dailySpendLimit: 100 };
    const saved = updatePlanning(service, { action: "profile", revision: plan.revision, profile });
    assert.equal(saved.planning!.profile.defaultSpendPeriod, "yearly");
    assert.equal(adaptiveMetrics(saved.transactions, saved.planning!, saved.dataDate!).topGoal!.id, "travel");
    assert.equal(inQuietHours(saved.planning!.profile, new Date("2026-09-10T17:30:00Z")), true);
    assert.equal(inQuietHours(saved.planning!.profile, new Date("2026-09-10T06:30:00Z")), false);
    assert.ok(planningAlerts(saved.transactions, saved.planning!, saved.dataDate!).some(a => a.id.startsWith("daily:")));
  } finally { service.store.close(); }
});

test("transaction-ID upsert merges inline/callback metadata once, including a separate Railway store", async () => {
  const restore = noN8n(); const local = fixture(); const railway = fixture();
  try {
    const receipt = local.ingestLive(payment({ id: "hybrid-demo-id" }), "phone");
    const tx = local.transaction(receipt.id);
    const metadata = { pipeline: "n8n-gemini-agent", behaviorTag: "discretionary-spike", anomalyScore: 75, observedPattern: "A larger-than-usual purchase at a recurring merchant.", budgetImpact: { status: "projected-overrun" }, savingsRecommendation: { amount: 100 }, rebalanceSuggestion: { fromCategory: "travel", toCategory: "personal", suggestedAmount: 100 }, goalImpact: { delayDays: 1 } };
    const envelope = { transaction: { id: tx.id, requestId: tx.requestId, merchant: tx.vendorClientName, amount: tx.amount, direction: tx.type, accountId: tx.accountId, date: tx.date, category: tx.categoryId, rail: tx.rail, agentMetadata: metadata } };
    assert.equal(local.ingestLive(envelope, "n8n").id, tx.id);
    assert.equal(local.ingestLive(envelope, "n8n").duplicate, true);
    assert.equal(local.state().liveTransactionCount, 1);
    assert.equal(local.transaction(tx.id).agentMetadata!.behaviorTag, "discretionary-spike");
    assert.deepEqual(local.transaction(tx.id).trace!.map(t => t.stage), [...LIVE_PIPELINE_STAGES]);
    const copied = railway.ingestLive(envelope, "n8n");
    assert.equal(copied.id, tx.id); railway.ingestLive(envelope, "n8n");
    assert.equal(railway.state().liveTransactionCount, 1);
    assert.equal(railway.state().memory!.learningUpdates.length, 1);
    assert.equal(railway.state().analytics.cashPosition, local.state().analytics.cashPosition);
    assert.throws(() => local.ingestLive({ transaction: { ...envelope.transaction, amount: 999 } }, "n8n"), /conflicts/);
    assert.throws(() => local.ingestLive(payment({ id: "hybrid-demo-id", requestId: "new-key", amount: 999 }), "phone"), /different transaction/);
    assert.throws(() => local.ingestLive(payment({ id: "income", requestId: "imported-id" }), "phone"), /imported bank/);
  } finally { restore(); local.store.close(); railway.store.close(); }
});

test("immediate n8n start confirmation leaves full local behavioral metadata available without waiting", async () => {
  const restore = noN8n(); process.env.N8N_INBOUND_WEBHOOK_URL = "https://workflow.example/start";
  const service = fixture();
  try {
    const started = performance.now();
    const tx = addLiveTransaction(service, payment({ id: "instant-id" }), "phone");
    assert.ok(performance.now() - started < 1500);
    const local = service.transaction(tx.id).agentMetadata!;
    for (const field of ["pipeline", "behaviorTag", "anomalyScore", "observedPattern", "budgetImpact", "savingsRecommendation", "rebalanceSuggestion", "goalImpact"]) assert.ok(Object.hasOwn(local, field));
    assert.equal(local.pipeline, "n8n-gemini-agent"); assert.equal(local.enrichmentSource, "local");
    await enrichLearning(service, tx.id, "phone", async () => Response.json({ message: "Workflow was started" }));
    assert.equal(service.transaction(tx.id).agentMetadata!.enrichmentSource, "local");
    await enrichLearning(service, tx.id, "phone", async (_url, init) => {
      const payload = JSON.parse(init!.body as string);
      assert.equal(payload.transaction.accountId, "bank"); assert.equal(payload.transaction.rail, "UPI");
      return Response.json({ transaction: { id: tx.id, agentMetadata: { behaviorTag: "inline-return", anomalyScore: 10, observedPattern: "Inline n8n enrichment is now available for this record." } } });
    });
    assert.equal(service.transaction(tx.id).agentMetadata!.behaviorTag, "inline-return");
    assert.equal(service.state().liveTransactionCount, 1);
  } finally { restore(); service.store.close(); }
});

test("fragmented authenticated memory stream delivers transaction updates directly", async () => {
  const state = { transactions: [{ id: "stream-test" }], memory: { revision: 2 } };
  const frame = `event: update\ndata: ${JSON.stringify({ state })}\n\n`;
  const delivered: any[] = [];
  await streamMemory({ Authorization: "Bearer test" }, new AbortController().signal, s => delivered.push(s), async (_url, init) => {
    assert.equal(new Headers(init!.headers).get("Authorization"), "Bearer test");
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(frame.slice(0, 13))); controller.enqueue(new TextEncoder().encode(frame.slice(13))); controller.close(); } }));
  });
  assert.equal(delivered[0].transactions[0].id, "stream-test");
});
