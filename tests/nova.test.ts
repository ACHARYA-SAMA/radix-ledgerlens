import { test } from "node:test";
import assert from "node:assert/strict";
import { NovaClient } from "../server/nova.ts";

test("pages at 200, authenticates server reads, caches successful pages", async () => {
  const calls: URL[] = [];
  const client = new NovaClient({
    key: "test-key",
    fetch: async (url, init) => {
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer test-key",
      );
      const u = new URL(String(url));
      calls.push(u);
      assert.equal(u.hostname, "www.aczen.in");
      assert.equal(u.searchParams.get("limit"), "200");
      return Response.json({
        data: [{ id: calls.length }],
        pagination: { has_more: calls.length === 1 },
      });
    },
  });
  assert.deepEqual(await client.list("bank-accounts"), [{ id: 1 }, { id: 2 }]);
  assert.deepEqual(await client.list("bank-accounts"), [{ id: 1 }, { id: 2 }]);
  assert.deepEqual(
    calls.map((u) => u.searchParams.get("offset")),
    ["0", "200"],
  );
});
test("health omits auth; single 404 is absent and never retried", async () => {
  let count = 0;
  const client = new NovaClient({
    key: "test",
    fetch: async (url, init) => {
      count++;
      if (String(url).endsWith("/health")) {
        assert.equal(new Headers(init?.headers).has("Authorization"), false);
        return Response.json({ status: "ok" });
      }
      return Response.json(
        { error: { code: "resource_not_found" } },
        { status: 404 },
      );
    },
  });
  assert.deepEqual(await client.health(), { status: "ok" });
  assert.equal(await client.get("bank-transactions", "absent"), null);
  assert.equal(count, 2);
});
test("retries 429 and 502 with server delay and backoff; rejects permanent errors", async () => {
  const delays: number[] = [];
  let n = 0;
  const client = new NovaClient({
    key: "test",
    sleep: async (ms) => {
      delays.push(ms);
    },
    fetch: async () => {
      n++;
      if (n === 1)
        return Response.json(
          { error: { code: "rate_limit_exceeded" } },
          { status: 429, headers: { "Retry-After": "2" } },
        );
      if (n === 2)
        return Response.json(
          { error: { code: "upstream_error" } },
          { status: 502 },
        );
      return Response.json({ data: { id: "yes" } });
    },
  });
  assert.deepEqual(await client.get("clients", "yes"), { id: "yes" });
  assert.deepEqual(delays, [2000, 1000]);
  const bad = new NovaClient({
    key: "test",
    fetch: async () =>
      Response.json({ error: { code: "invalid_api_key" } }, { status: 401 }),
  });
  await assert.rejects(bad.me(), { code: "invalid_api_key" });
});
