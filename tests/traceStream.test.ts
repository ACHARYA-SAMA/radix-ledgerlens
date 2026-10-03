/* Repository touch marker. */
import assert from "node:assert/strict";
import test from "node:test";
import { streamTrace } from "../src/lib/traceStream.ts";

test("trace replay sends authorization and handles SSE frames split across chunks", async () => {
  const encoder = new TextEncoder();
  const events: number[] = [];
  const chunks = [
    "id: 1\nevent: step\ndata: {\"index\":0,\"stage\":\"Fetched\"}\n\n",
    "id: 2\nevent: ste",
    "p\ndata: {\"index\":1,\"stage\":\"Final decision\"}\n\n",
    "event: done\ndata: {}\n\n",
  ];
  const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer valid-token");
    return new Response(new ReadableStream({
      start(controller) {
        chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      },
    }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
  };
  await streamTrace("/api/transactions/a/trace", { Authorization: "Bearer valid-token" }, new AbortController().signal, event => events.push(event.index), fetcher);
  assert.deepEqual(events, [0, 1]);
});

test("trace replay reports a protected-route failure", async () => {
  await assert.rejects(
    streamTrace("/api/transactions/a/trace", {}, new AbortController().signal, () => {}, async () =>
      new Response(JSON.stringify({ error: "Please sign in to continue." }), { status: 401, headers: { "Content-Type": "application/json" } })),
    /Please sign in to continue/,
  );
});
