import { test } from "node:test";
import assert from "node:assert/strict";
import { authenticatedFetch } from "../src/lib/authenticatedFetch.ts";

test("a rejected intake request refreshes the token and retries its original body", async () => {
  let token = "expired";
  let calls = 0;
  let expired = false;
  const response = await authenticatedFetch("/api/voice/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript: "Paid ₹12,500 to Greenfield Properties for office rent." }),
  }, {
    headers: async () => ({ Authorization: `Bearer ${token}` }),
    refresh: async () => { token = "renewed"; return true; },
    expire: async () => { expired = true; },
  }, async (_url, init) => {
    calls++;
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("content-type"), "application/json");
    assert.match(String(init?.body), /Greenfield Properties/);
    if (calls === 1) {
      assert.equal(headers.get("authorization"), "Bearer expired");
      return Response.json({ error: "Your session has expired." }, { status: 401 });
    }
    assert.equal(headers.get("authorization"), "Bearer renewed");
    return Response.json({ extractedAmount: 12500 });
  });
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  assert.equal(expired, false);
});

test("a permanently expired session signs out after the failed refresh", async () => {
  let expired = 0;
  let calls = 0;
  const response = await authenticatedFetch("/api/voice/extract", { method: "POST" }, {
    headers: async () => ({ Authorization: "Bearer expired" }),
    refresh: async () => false,
    expire: async () => { expired++; },
  }, async () => {
    calls++;
    return Response.json({ error: "Your session has expired." }, { status: 401 });
  });
  assert.equal(response.status, 401);
  assert.equal(calls, 1);
  assert.equal(expired, 1);
});
