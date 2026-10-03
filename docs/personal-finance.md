# Personal financial intelligence

## Architecture and data preservation

The existing bank client in `server/nova.ts`, provider URLs, environment variables, imported source snapshots, classification pipeline and Supabase sign-in remain in place. The presentation name is **Account Aggregator (AA) Bank Sync**. `shared/branding.ts` applies it to rendered text and PDFs without renaming provider identifiers or editing bank records.

New functionality is additive:

- `server/personalFinance.ts` validates live submissions, manages plans and generates coach reports.
- SQLite's existing team/dataset partition stores `live-transaction`, `live-request` and `planning` records separately from imported snapshots.
- `LedgerService.state()` combines live and imported entries for analytics, search, voice, traces, sharing and reports. A later bank sync replaces only the imported snapshot; live entries remain. Account balances overlay live movements on imported closing balances.
- `shared/planning.ts` supplies the same integer-paise-based calculations to the server, UI and planning PDF.
- `/api/live-events` sends only a change signal. The authenticated dashboard then fetches `/api/state`; a three-second polling fallback handles missed events and reconnects.

All existing tabs remain available. **Goals & Budgets**, **Phone Remote** and **Profile & alert preferences** are added to navigation. Existing deployment settings continue to work; no new environment variables or npm dependencies are required.

## Run and demonstrate

Use Node 24. Run `npm ci` if dependencies are absent, then `npm run dev` from the project directory. Sign in on the laptop and sync the bank feed.

1. Open **Goals & Budgets**. Starter goals contain explicitly labeled illustrative savings balances; edit them or choose **Start from zero**. The initial income target and category limits are based on the latest statement month.
2. Use **Phone Remote** to copy the `/#mobile` quick link. `?mobile=true` works too. Open it on the phone without signing in.
3. Tap a preset or enter a merchant, amount, direction, bank account, date, rail and category. The sender defaults to the latest imported statement date, using the actual five connected account IDs.
4. The laptop displays a live toast and updates its ledger, analytics and plan. An expense crossing a configured budget threshold triggers a spending alert. Browser audio requires prior interaction and follows the interface mute setting.
5. **Generate AI report** requests Gemini synthesis using aggregate financial figures. An unavailable or invalid model response produces a clearly labeled built-in report. **Export report** downloads a goals/budgets PDF; the original Analytics PDF remains available.

Development binds to `127.0.0.1:3005`, so a phone cannot use the laptop's localhost URL. Use the app's configured public HTTPS origin (`PUBLIC_BASE_URL`) for the phone demonstration. The quick-link dialog explains this when opened locally. A configured server and laptop dashboard must both be running.

These are demo ledger entries, not bank payments. Income uses `other_income`; food uses `other_expense`; shopping uses `personal`; subscriptions use `software`. Goal contributions use `internal_transfer` and update the emergency-reserve goal in the same SQLite transaction. Goal allocations in the planning view only update the plan and do not create bank transactions.

## n8n webhook

Use an HTTP Request node with method **POST**, URL `https://<configured-app-origin>/api/webhook/n8n`, content type **application/json**, and this JSON body:

```json
{
  "requestId": "n8n-unique-event-123",
  "merchant": "Corner coffee",
  "amount": 850,
  "direction": "debit",
  "accountId": "<id from /api/live-config>",
  "date": "2026-09-29",
  "rail": "UPI",
  "category": "other_expense"
}
```

The endpoint also accepts `{ "transaction": { ... } }`. Omit `date` to use the latest imported statement date. Amounts are positive INR numbers with at most two decimals; directions are `credit` or `debit`. The public `/api/live-config` endpoint returns connected account choices and category IDs. It does not return balances or statements.

Keep the same `requestId` when retrying an event. An identical retry returns HTTP 200 without duplicating it; a new event returns 201. Reusing an ID with different content returns 409. Invalid input returns 400; unavailable initial bank data returns 409; intake is limited to 60 requests per minute per source IP. The mobile route uses the same rules at `POST /api/live-transaction`.

For a goal contribution, use `category: "internal_transfer"`, `direction: "debit"` and `goalId: "emergency"`. Over-allocation and unknown goals are rejected without partial writes.

## Access and planning semantics

As requested for the demo, mobile metadata, the change-signal stream and the two transaction submission endpoints are public. A caller who knows the configured app URL can add validated demo entries. Host/origin checks, payload validation, body-size limits, duplicate protection and intake throttling apply. Financial records, plan changes, AI reports, voice and audio remain behind the existing Supabase guard. Shared transaction links keep their existing token-based access.

The existing application uses one shared workspace per provider team/dataset. Profiles, plans and live entries use that same partition; they are not separately isolated per signed-in Supabase user.

Budgets count debits in the latest active statement month and exclude internal transfers. Visual status changes at 80% and 100%; notifications use the configurable thresholds. Safe-to-spend uses received monthly income capped at the income target, subtracts expenses and the savings target, and divides by the days remaining including the statement date. It never counts unreceived target income. Weekly summaries cover the seven days ending on the active statement date. Renewal reminders cover the next seven days from that date. Cash-flow forecasts extrapolate the recorded daily pace and are labeled estimates.

Plan edits include a revision number to reject stale concurrent edits. Live submissions, goals, budgets and preferences survive a restart. Account cards and reports include the live balance overlay without changing any imported transaction.

## Verification

Run `npm test`, `npm run lint`, and `npm run build`. Tests cover existing features plus live persistence, resync retention, team isolation, atomic goal contributions, duplicate IDs, validation, concurrent plan edits, budget crossings, renewal dates, public intake versus authenticated data, SSE payload privacy, account balances and PDF generation.
