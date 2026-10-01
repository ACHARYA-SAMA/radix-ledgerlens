import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createVoiceApp } from "../server.ts";

test("voice HTTP routes serve MP3s and preserve text on TTS errors", async (t) => {
  const diagnostics: string[] = [];
  for (const level of ["info", "warn", "error"] as const) {
    t.mock.method(console, level, (...args: unknown[]) => diagnostics.push(args.join(" ")));
  }
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.ELEVENLABS_API_KEY;
  const originalVoice = process.env.ELEVENLABS_VOICE_ID;
  process.env.ELEVENLABS_API_KEY = "test-key";
  process.env.ELEVENLABS_VOICE_ID = "test-voice";
  let mode = "success";
  globalThis.fetch = (async (url, init) => {
    assert.equal(String(url), "https://api.elevenlabs.io/v1/text-to-speech/test-voice");
    assert.equal(new Headers(init?.headers).get("xi-api-key"), "test-key");
    assert.equal(JSON.parse(String(init?.body)).model_id, "eleven_flash_v2_5");
    assert.doesNotMatch(JSON.parse(String(init?.body)).text, /[₹();]|fixed dataset date/);
    assert.ok(init?.signal);
    if (mode === "timeout") throw new DOMException("Timed out", "TimeoutError");
    if (mode === "error") return new Response('{"detail":{"status":"invalid_api_key","message":"denied"}}', { status: 401 });
    return new Response(new Uint8Array([73, 68, 51, 1, 2, 3]), { headers: { "Content-Type": "audio/mpeg" } });
  }) as typeof fetch;
  const asked: string[] = [];
  const ledger = { ask: (query: string) => {
    asked.push(query);
    return { id: crypto.randomUUID(), query, answer: `Imported-ledger answer for ${query}.`, timestamp: "2026-10-01T00:00:00Z" };
  } };
  const server = createVoiceApp(ledger).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const greeting = await (await originalFetch(`${base}/voice/greeting`)).json();
    assert.match(greeting.text, /You're through to Radix Ledger Lens/);
    assert.match(greeting.audioUrl, /^\/audio\/[a-f0-9]+$/);
    assert.ok(diagnostics.some((line) => line.includes("ElevenLabs succeeded (HTTP 200)")));
    const cachedGreeting = await (await originalFetch(`${base}/voice/greeting`)).json();
    assert.equal(cachedGreeting.audioUrl, greeting.audioUrl);
    assert.ok(diagnostics.some((line) => line.includes("cache hit")));
    const audio = await originalFetch(base + greeting.audioUrl);
    assert.match(audio.headers.get("content-type")!, /audio\/mpeg/);
    assert.deepEqual(new Uint8Array(await audio.arrayBuffer()), new Uint8Array([73, 68, 51, 1, 2, 3]));
    assert.equal((await originalFetch(`${base}/audio/missing`)).status, 404);
    process.env.ELEVENLABS_API_KEY = "  test-key  ";
    process.env.ELEVENLABS_VOICE_ID = "  test-voice  ";
    const spoken = await (await originalFetch(`${base}/voice/speak`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "27 overdue invoices (₹48,16,276.13); 6 overdue purchase bills (₹9,34,682.95). Status comes from Nova’s fixed dataset date." }),
    })).json();
    assert.equal(spoken.text, "27 overdue invoices, 48.2 lakh rupees. 6 overdue purchase bills, 9.3 lakh rupees.");
    assert.match(spoken.audioUrl, /^\/audio\/[a-f0-9]+$/);
    assert.ok(diagnostics.some((line) => line.includes("[ElevenLabs] Generated 6 bytes of MP3 audio")));
    assert.equal((await originalFetch(`${base}/voice/speak`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 400);
    for (const failure of ["error", "timeout"]) {
      mode = failure;
      const response = await originalFetch(`${base}/voice/process`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ speechResult: "balance" }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { text: "Imported-ledger answer for balance.", intent: "analytics", audioUrl: null });
    }
    const form = await originalFetch(`${base}/voice/process`, { method: "POST", body: new URLSearchParams({ speechResult: "pending" }) });
    assert.equal((await form.json()).intent, "analytics");
    assert.deepEqual(asked, ["balance", "balance", "pending"]);
    assert.ok(diagnostics.some((line) => line.includes('HTTP 401; error body: {"detail":{"status":"invalid_api_key","message":"denied"}}')));
    assert.ok(diagnostics.some((line) => line.includes("ElevenLabs unavailable:")));
    assert.ok(diagnostics.some((line) => line.includes("TimeoutError Timed out")));
    for (const body of [{}, { speechResult: 123 }, { speechResult: " " }]) {
      assert.equal((await originalFetch(`${base}/voice/process`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).status, 400);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = originalKey;
    if (originalVoice === undefined) delete process.env.ELEVENLABS_VOICE_ID;
    else process.env.ELEVENLABS_VOICE_ID = originalVoice;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
