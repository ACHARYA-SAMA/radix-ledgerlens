# Memory and n8n learning

## Production connection

The integration works without n8n. Leave `N8N_INBOUND_WEBHOOK_URL` empty to use the configured server-side Gemini engine directly, with deterministic analysis when Gemini is missing, unavailable or returns invalid output.

1. Import `workflows/ledgerlens-memory.n8n.json` into n8n.
2. The **LedgerLens memory webhook** node uses POST, path `ledgerlens-memory`, and **Authentication: None**, as requested. It responds through the **Return learning update** node.
3. In **Gemini learning**, attach a generic **Header Auth** credential with header `x-goog-api-key` and your Gemini API key. This credential authenticates the model call, not the public webhook. The workflow contains no secrets. It uses the model configured by LedgerLens (`GEMINI_MODEL`).
4. The configured production inbound webhook is:

   ```dotenv
   N8N_INBOUND_WEBHOOK_URL=https://rish011.app.n8n.cloud/webhook/transaction-ingest
   ```

5. Restart the LedgerLens server after changing the value. Local n8n can use `http://127.0.0.1:5678/webhook/ledgerlens-memory`; remote URLs require HTTPS. If the variable is absent, the built-in Gemini and deterministic learning path remains active.

The app posts JSON without an Authorization header. The optional environment variable remains server-side. Workflow execution logging is disabled in the supplied template because the context includes financial information. Use manual workflow execution to inspect test data when needed.

Official references: [n8n Webhook configuration](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/) and [Respond to Webhook](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook/).

## Pipeline

1. Validate the live transaction, account, amount, date, category and request ID.
2. Before inserting it, derive its merchant history and category velocity from the team-scoped SQLite ledger. Backdated entries only compare against history through their transaction date.
3. Apply any explicit saved merchant-category preference to ordinary live expenses. Income and internal transfers retain their submitted classification.
4. Atomically persist the transaction, retry key, pre-transaction context and deterministic learning update. Imported bank snapshots are unchanged.
5. Broadcast a change immediately, then POST `{event, version, model, transaction, memorySnapshot, learningUpdate}` to the configured n8n URL without awaiting it. No account numbers, tokens or bank credentials are included.
6. The configured n8n workflow may return the immediate `{"message":"Workflow was started"}` acknowledgment. LedgerLens ignores that acknowledgment and keeps the already persisted local enrichment. A valid inline enrichment or later callback updates the same transaction ID. HTTP errors, malformed responses, redirects and timeouts retain the saved local learning; intake never waits on AI.
7. Validate narrative enrichment and transaction correlation. Calculated forecasts, rebalance amounts and goal impacts remain authoritative ledger calculations. Store the explanation and provider, append it to Decision Trace, and broadcast the updated state.

The four persisted layers are merchant episodes, behavioral traits, explicit preference rules, and recent transaction learning. `records(kind='agent_memory', id='current')` holds the team-scoped state. Per-entry `learning-context` records retain the context sent to the model. Recent memory retains the last 30 learning updates, with up to 100 saved preference rules. Imported history seeds memory when first read; sync, review, planning changes and live entries refresh it.

## n8n acknowledgments and callbacks

The configured workflow starts asynchronously and responds with `{"message":"Workflow was started"}`. This is a valid acknowledgment, not transaction data, and never replaces a saved transaction. A later callback from **Send to LedgerLens** should POST to:

```
https://ledgerlens-production-c966.up.railway.app/api/webhook/n8n
```

The callback can send a bounded enrichment such as:

```json
{
  "transactionId": "live_ID_FROM_REQUEST",
  "learningUpdate": {
    "explanation": "This purchase is above your prior merchant average. Review the proposed flexible-category rebalance."
  }
}
```

The supplied workflow also returns the complete original deterministic `learningUpdate`: `observedPattern`, `velocityForecast`, `rebalanceSuggestion`, and `goalImpact`. The application accepts the bounded explanation; externally supplied monetary calculations cannot overwrite saved facts or execute actions.

For asynchronous workflows, POST the same response body to the app's public `POST /api/webhook/n8n` endpoint. It requires `Content-Type: application/json`, a real existing transaction ID, and a 10–1200 character explanation. Callbacks return only `{id, duplicate, status}`. Identical retries are harmless; unknown IDs and entries corrected by a human are rejected. A late Gemini response does not replace a successful n8n callback. No outbound forwarding occurs for a learning callback, preventing callback loops. The app must have a reachable HTTPS `PUBLIC_BASE_URL` configured for remote n8n callbacks.

That endpoint also continues to accept new transactions, either directly or under `transaction`, using the existing `requestId`, `merchant`, `amount`, `direction`, `accountId`, `date`, `category`, and `rail` schema described in [personal-finance.md](personal-finance.md). Duplicate transaction retries never reinsert or re-run learning. The intake's existing host/origin validation and 60 requests/minute rate limit also apply to callbacks.

## Live state and forecast actions

`GET /api/live-events` remains a public metadata-only refresh signal. `GET /api/live-stream` requires the same bearer authentication as `/api/state` and emits `event: update` with `{memory, transaction, state}`. Connections rotate every minute to revalidate authentication on reconnect; the dashboard also reconciles `/api/transactions` every 2.5 seconds.

Budget burn is month-to-date expense divided by elapsed calendar days; month-end forecasts assume unchanged pace. Fixed-category planning heuristics protect rent, utilities, insurance, loan repayments, tax, payroll and bank charges from donor suggestions. A rebalance only reallocates existing flexible-budget surplus, preserves the total limit, and is recalculated at application time. Partial suggestions may not cover an entire overrun.

Goal estimates use positive historical net savings per covered calendar day. Priority goals receive that velocity first, then subsequent goals; the same savings capacity is not assigned to every goal simultaneously. With no positive velocity, no completion date or numeric day shift is invented. Micro-sweeps reserve a portion of unallocated current-month net savings and cannot allocate beyond the goal's remaining amount. A daily spend lock is an advisory planning limit, not a bank restriction.

Validation: `npm test` covers prior-history context, durable memory and team isolation, category preference overrides, atomic rebalances, sweep reservations, webhook payloads, model failure and timeout fallback, callback retries, protected streams, and executable workflow Code nodes. A real n8n-hosted execution requires the user's production webhook URL; the automated tests use controlled responses and local HTTP routes.
