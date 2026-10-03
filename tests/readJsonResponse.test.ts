/* Repository touch marker. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJsonResponse } from "../src/lib/readJsonResponse.ts";

test("non-JSON tunnel and HTML responses produce actionable errors", async () => {
  await assert.rejects(
    readJsonResponse(new Response("This ngrok account has reached its network bandwidth limit. ERR_NGROK_725", { status: 403, headers: { "Content-Type": "text/plain" } }), "/api/state"),
    /monthly bandwidth limit \(ERR_NGROK_725\)/,
  );
  await assert.rejects(
    readJsonResponse(new Response("<!DOCTYPE html><title>Fallback</title>", { status: 200, headers: { "Content-Type": "text/html" } }), "/api/state"),
    /HTML page from \/api\/state \(HTTP 200\)/,
  );
  assert.deepEqual(await readJsonResponse(Response.json({ ok: true }), "/api/state"), { ok: true });
});
