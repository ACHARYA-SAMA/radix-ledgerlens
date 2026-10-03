/* Repository touch marker. */
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { requireAuth } from "../server/auth.ts";

test("protected routes reject missing and invalid bearer tokens and accept verified sessions", async () => {
  const app = express();
  const verified: string[] = [];
  app.use(requireAuth(async token => { verified.push(token); return token === "valid-token"; }));
  app.get("/private", (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    assert.equal((await fetch(base + "/private")).status, 401);
    assert.equal((await fetch(base + "/private", { headers: { Authorization: "Bearer wrong" } })).status, 401);
    const allowed = await fetch(base + "/private", { headers: { Authorization: "Bearer valid-token" } });
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), { ok: true });
    assert.deepEqual(verified, ["wrong", "valid-token"]);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("verification outages return 503 rather than falsely expiring the session", async () => {
  const app = express();
  app.use(requireAuth(async () => { throw Error("upstream unavailable"); }));
  app.get("/private", (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const response = await fetch(base + "/private", { headers: { Authorization: "Bearer valid-token" } });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /temporarily unavailable/);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
