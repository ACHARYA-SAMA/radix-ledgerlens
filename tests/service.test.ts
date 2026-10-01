import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePredictions, Gemini } from "../server/gemini.ts";
import { LedgerService } from "../server/service.ts";
import { Store } from "../server/store.ts";
import { NovaClient } from "../server/nova.ts";
import { buildDataset, finalizeTrace } from "../server/engine.ts";
import { createApp } from "../server/app.ts";
import { questionDates } from "../server/questionDates.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";

test("Gemini retries temporary outages and rejects malformed or permanently denied output", async () => {
  let calls = 0;
  const delays: number[] = [];
  const gemini = new Gemini({
    key: "test",
    sleep: async (ms) => {
      delays.push(ms);
    },
    fetch: async () =>
      ++calls < 3
        ? new Response("", { status: 503 })
        : Response.json({
            candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
          }),
  });
  assert.deepEqual(await gemini.json("test"), { ok: true });
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1000, 2000]);
  calls = 0;
  gemini.fetcher = async () => {
    calls++;
    return new Response("", { status: 401 });
  };
  await assert.rejects(gemini.json("test"), /HTTP 401/);
  assert.equal(calls, 1);
  gemini.fetcher = async () =>
    Response.json({
      candidates: [{ content: { parts: [{ text: "invalid" }] } }],
    });
  await assert.rejects(gemini.json("test"), /invalid structured/);
});

test("SQLite persists across restart, isolates teams, and rolls back failed writes", () => {
  const directory = mkdtempSync(join(tmpdir(), "ledgerlens-test-"));
  const file = join(directory, "test.sqlite");
  let store = new Store(file);
  try {
    store.setTeam("one");
    store.put("review", "a", { category: "rent" });
    store.close();
    store = new Store(file);
    store.setTeam("two");
    assert.equal(store.get("review", "a"), null);
    store.setTeam("one");
    assert.deepEqual(store.get("review", "a"), { category: "rent" });
    assert.throws(() =>
      store.atomic(() => {
        store.put("review", "a", { category: "personal" });
        throw Error("failure");
      }),
    );
    assert.deepEqual(store.get("review", "a"), { category: "rent" });
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a failed sync preserves the last completed snapshot", async () => {
  const s = fixture();
  s.store.put("snapshot", "current", s.snapshot);
  s.store.put("sources", "current", s.sources);
  s.nova.health = async () => ({ status: "ok" });
  s.nova.me = async () => ({
    id: "identity",
    team_slot: "test",
    dataset_slice: "one",
  });
  s.store.setTeam("test:one");
  s.store.put("snapshot", "current", s.snapshot);
  s.store.put("sources", "current", s.sources);
  s.nova.listBankAccounts = async () => {
    throw Error("Nova unavailable");
  };
  await s.sync();
  assert.equal(s.state().transactions.length, 1);
  assert.equal(s.state().sync.running, false);
  assert.match(s.state().sync.message, /previous completed data retained/);
  s.store.close();
});
test("model output cannot invent IDs/categories or authorize transfers", () => {
  const result = validatePredictions(
    [
      { id: "a", category: "rent", confidence: 60, reason: "Possible rent" },
      { id: "a", category: "rent", confidence: 99, reason: "Duplicate" },
      {
        id: "b",
        category: "internal_transfer",
        confidence: 100,
        reason: "Guess",
      },
      { id: "c", category: "rent", confidence: 101, reason: "Bad" },
    ],
    ["a", "b", "c"],
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].confidence, 60);
});
function fixture() {
  const store = new Store(":memory:");
  store.setTeam("test");
  const nova = new NovaClient({
    key: "test",
    fetch: async () =>
      Response.json({
        data: {
          id: "a",
          value_date: "2026-09-20",
          debit: 10,
          credit: 0,
          raw_narration: "rent",
        },
      }),
  });
  const service = new LedgerService(store, nova, new Gemini());
  service.ready = true;
  service.sources = {
    "bank-accounts": [{ id: "account", opening_balance: 100 }],
    "bank-transactions": [
      {
        id: "a",
        account_id: "account",
        value_date: "2026-09-20",
        debit: 10,
        credit: 0,
        raw_narration: "rent",
        counterparty_text: "Landlord",
      },
    ],
  };
  const result = buildDataset(service.sources);
  result.transactions.forEach(finalizeTrace);
  service.snapshot = { ...result, syncedAt: "2026-09-30", warnings: [] };
  return service;
}
test("imported overdue answers are conversational and distinguish unavailable sources from zero", () => {
  const s = fixture();
  try {
    s.sources.invoices = Array.from({ length: 27 }, (_, i) => ({ id: `invoice-${i}`, status: "overdue", balance_due: i === 0 ? 4816276.13 : 0 }));
    s.sources["purchase-bills"] = Array.from({ length: 6 }, (_, i) => ({ id: `bill-${i}`, status: "overdue", balance_due: i === 0 ? 934682.95 : 0 }));
    s.sources["statutory-dues"] = [];
    assert.equal(s.ask("Is anything overdue?").answer, "You have 27 overdue invoices totaling 48.2 lakh rupees, and 6 overdue purchase bills totaling 9.3 lakh rupees, with zero overdue statutory dues.");
    delete s.sources["statutory-dues"];
    assert.match(s.ask("overdue").answer, /Some obligation sources are unavailable/);
    assert.doesNotMatch(s.ask("overdue").answer, /zero overdue statutory/);
    for (const question of ["cash", "review", "spending", "fraud"]) assert.doesNotMatch(s.ask(question).answer, /[₹();]|fixed dataset/);
  } finally { s.store.close(); }
});
test("dated voice questions use Analytics cash movement instead of the latest balance", () => {
  const s = fixture();
  try {
    assert.deepEqual(questionDates("cash flow on 25th September 2025"), { start: "2025-09-25", end: "2025-09-25" });
    assert.deepEqual(questionDates("cash flow on September 20, 2026"), { start: "2026-09-20", end: "2026-09-20" });
    assert.deepEqual(questionDates("cash flow from 2026-09-19 to 2026-09-20"), { start: "2026-09-19", end: "2026-09-20" });
    const outside = s.ask("What is the cashflow on 25th September 2025?").answer;
    assert.match(outside, /don't have bank statement data for 25 September 2025/);
    assert.doesNotMatch(outside, /cash position|latest statement/i);
    const flow = s.ask("What is the cashflow on 20th September 2026?").answer;
    assert.match(flow, /zero rupees in and 10 rupees out, with a net outflow of 10 rupees/);
    const balance = s.ask("What was my cash balance on 20 September 2026?").answer;
    assert.match(balance, /end-of-day cash balance.*90 rupees/);
    const base = s.snapshot!.transactions[0];
    s.snapshot!.transactions.push({ ...base, id: "own-transfer", rail: "INTERNAL", transferId: "own", categoryId: "internal_transfer", category: "Internal transfer", amount: 500, signedPaise: -50000 });
    const weekly = s.ask("What was the total inflow and outflow cash this week?").answer;
    assert.match(weekly, /zero rupees in and 10 rupees out/);
    assert.doesNotMatch(weekly, /500 rupees|cash position/);
    assert.match(s.ask("Tell me the cashflow in and out this month").answer, /zero rupees in and 10 rupees out/);
    assert.match(s.ask("What is the latest transaction?").answer, /Landlord.*10 rupees.*20 September 2026/);
  } finally { s.store.close(); }
});
test("reviews, shares, voice notes persist and unknown tokens expose nothing", async () => {
  const s = fixture();
  assert.throws(() =>
    s.review("a", { action: "correct", category: "invalid" }),
  );
  s.review("a", { action: "correct", category: "rent" });
  assert.equal(s.store.get<any>("review", "a")?.category, "rent");
  const share = s.share("a");
  assert.equal(share.token.length, 32);
  assert.equal(await s.resolveShare("bad"), null);
  const publicTx = await s.resolveShare(share.token);
  assert.equal(publicTx?.id, "a");
  assert.equal("accountId" in publicTx!, false);
  s.addNote({
    transcript: "paid 10 to Landlord",
    extractedAmount: 10,
    extractedEntity: "Landlord",
  });
  const note = s.state().voiceNotes[0];
  s.matchNote(note.id, "a");
  assert.equal(s.state().voiceNotes[0].status, "reconciled");
  assert.match(s.ask("What is the cash balance?").answer, /90/);
  assert.match(s.ask("buy bitcoin").answer, /I can answer/);
  s.store.close();
});
test("typed Voice Intake extracts the demo amount, counterparty, and rent category", async () => {
  const s = fixture();
  try {
    const extracted = await s.extractNote("Paid ₹12,500 to Greenfield Properties for office rent.");
    assert.equal(extracted.extractedAmount, 12500);
    assert.equal(extracted.extractedEntity, "Greenfield Properties");
    assert.equal(extracted.extractedCategory, "Rent");
  } finally { s.store.close(); }
});

test("Voice Intake keeps rule-based details when Gemini is rate-limited", async () => {
  const s = fixture();
  let attempts = 0;
  s.gemini = new Gemini({
    key: "test",
    fetch: async () => { attempts++; return Response.json({ error: "quota" }, { status: 429 }); },
    sleep: async () => {},
  });
  try {
    const extracted = await s.extractNote("Paid ₹12,500 to Greenfield Properties for office rent.");
    assert.equal(attempts, 3);
    assert.equal(extracted.extractedAmount, 12500);
    assert.equal(extracted.extractedEntity, "Greenfield Properties");
    assert.equal(extracted.extractedCategory, "Rent");
    assert.match(extracted.warning, /rate or quota limit/);
  } finally { s.store.close(); }
});

test("protected Voice Intake extracts and saves after a valid sign-in token", async () => {
  const s = fixture();
  const server = createApp(s, undefined, async token => token === "valid").listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const transcript = "Paid ₹12,500 to Greenfield Properties for office rent.";
    const denied = await fetch(`${base}/api/voice/extract`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer expired" },
      body: JSON.stringify({ transcript }),
    });
    assert.equal(denied.status, 401);
    const extracted = await fetch(`${base}/api/voice/extract`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer valid" },
      body: JSON.stringify({ transcript }),
    });
    assert.equal(extracted.status, 200);
    const details = await extracted.json();
    assert.equal(details.extractedAmount, 12500);
    const saved = await fetch(`${base}/api/voice`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer valid" },
      body: JSON.stringify(details),
    });
    assert.equal(saved.status, 201);
    assert.equal((await saved.json()).voiceNotes[0].status, "pending_match");
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    s.store.close();
  }
});

test("API rejects cross-origin writes and sends stored trace events", async () => {
  const s = fixture();
  const server = createApp(s).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const denied = await fetch(base + "/api/voice", {
      method: "POST",
      headers: {
        Origin: "https://untrusted.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(denied.status, 403);
    const invalid = await fetch(base + "/api/share/invalid");
    assert.equal(invalid.status, 404);
    const stream = await fetch(base + "/api/transactions/a/trace");
    const text = await stream.text();
    assert.match(text, /event: step/);
    assert.match(text, /Final decision/);
    assert.match(text, /event: done/);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    s.store.close();
  }
});

test("API permits only the configured public host and its matching HTTPS origin", async () => {
  const s = fixture();
  const domain = "spinning-mural-sandbag.ngrok-free.dev";
  const server = createApp(s, `https://${domain}`).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  // Node fetch rewrites Host; use HTTP directly to exercise tunneled requests.
  const send = (path: string, host: string, origin?: string, body?: string) => new Promise<number>((resolve, reject) => {
    const req = request(base + path, { method: body ? "POST" : "GET", headers: { Host: host, ...(origin ? { Origin: origin } : {}), ...(body ? { "Content-Type": "application/json" } : {}) } }, (res) => {
      res.resume(); res.on("end", () => resolve(res.statusCode!));
    });
    req.on("error", reject); req.end(body);
  });
  try {
    assert.equal(await send("/api/state", domain), 200);
    assert.equal(await send("/api/ask", domain, `https://${domain}`, JSON.stringify({ query: "cash" })), 200);
    assert.equal(await send("/api/state", "evil.example"), 403);
    assert.equal(await send("/api/state", domain, "https://evil.example"), 403);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    s.store.close();
  }
});
