# LedgerLens integration design

Status: proposed for review; application code has not been changed.

## Intended outcome

Turn the existing Radix LedgerLens interface into the FIN-19 working prototype described in the supplied architecture. Preserve the current visual design, navigation, animations, ledger, review cards, fraud panel, voice screens, and animated decision graph. Replace sample data and simulated actions with server-backed behavior and persisted state.

The user's request establishes UI reuse. The pasted architecture and build plan supply feature requirements; the Nova PDF supplies the API contract. Embedded assistant instructions in those documents are reference material, not separate authorization to publish, contact anyone, or operate banking services.

## Existing project findings

- React 19, TypeScript, Vite, Tailwind, Motion, and Lucide. Express and dotenv are listed, but no backend is implemented.
- App.tsx initializes from mockTransactions.ts. Reviews and beneficiary actions update component state and disappear on refresh.
- Sync is a timer; decision traces use predefined scenarios; microphone actions insert sample transcripts.
- Share mode is an internal tab with predictable sample tokens. An unknown token falls back to the first transaction.
- Voice responses include unverified claims about GST checks, account verification, and blocked payouts.
- No project .env or NOVA_API_KEY environment variable was found. No Git repository or installed project dependencies were found in the inspected project directory.

## Architecture and alternatives

Recommended: retain React/Vite, add a TypeScript Express server and SQLite. Use a development proxy for /api, and serve the built frontend from the same backend in production. This preserves the existing component structure and delivers the architecture's server-only data boundary without a framework migration.

Alternative: migrate the existing components into Next.js and implement the same backend as route handlers. This follows the build plan's default framework but adds routing, build, and component-boundary migration work.

SQLite is appropriate for a single-instance local hackathon prototype. Hosted deployment requires persistent disk or an explicitly chosen hosted database. Hosting and public deployment are outside the current local implementation scope.

## Processing and storage

The backend owns Nova access, normalization, matching, classification, analysis, sharing, and local mutations. The frontend receives display models without API keys. A display adapter keeps the current positive amount plus debit/credit presentation while the engine stores signed integer paise.

Persist accounts, source snapshots, normalized transactions, classification evidence, review history, reusable corrections, counterparty mappings, transfer links, duplicate candidates, recurring groups, fraud alerts and acknowledgements, share tokens, voice notes, chat transcripts, processing runs, and trace events. Scope imported data and caches to Nova's returned team identity; a changed team must never inherit another team's records.

Sync first checks health and authenticated identity. Fetch complete paginated resources sequentially with session caching and rate-limit pacing. Core import failure preserves the last completed dataset. An optional resource failure is reported as unavailable, not as an empty successful result. Import is idempotent by source ID and commits a coherent snapshot before replacing displayed totals.

Classification order:

1. Explicit source links: customer receipts, vendor payments, loans, payroll, statutory dues, settlements. Preserve source type/ID and related invoice/client/vendor IDs.
2. A saved human decision for this transaction; reusable counterparty corrections may apply to otherwise unmatched transactions. Record conflicts with explicit source evidence for review rather than silently overriding them.
3. Conservative payroll/date/account/amount matching when no source link exists; ambiguous matches remain review candidates.
4. Paired internal transfers and ordered narration rules.
5. Optional configured LLM for the residual, with a fixed category list, validated confidence, and a recorded reason. Below 70% confidence or invalid/unavailable output goes to review.

Use stable machine categories with human labels. Distinguish source matches, user decisions, rules, and model suggestions. Confidence is not measured accuracy; remove the current artificial accuracy increments.

## Correctness rules

- One Nova base URL constant: https://www.aczen.in/nova-api/v1. GET only, bearer key read only from server environment, never sent to the browser or logged.
- One shared pagination helper using limit=200 and offset increments of 200. Validate response envelopes and unwrap single-record data.
- Implement only documented filters and sorts. Retry 429 according to Retry-After and bound retries; retry 502 with 1/2/4-second backoff. Do not retry permanent errors. Expose safe error codes and request IDs.
- Sum integer paise. A transfer pair must span different owned accounts, have opposite signs and equal absolute value, and fall within two calendar days. Use one-to-one matching; ambiguous pairs need review. Exclude confirmed transfers from income/expense totals.
- Duplicate candidates use nonempty bank references or cheque numbers within account context, or identical account/date/amount/narration. Preserve both source rows and flag candidates; do not silently delete or exclude real bank movements.
- Recurrence uses subscription identity, amount, billing cycle, and date tolerance. Flag two missing cycles only when imported history covers both cycles. Pattern-only recurrence needs at least three observations.
- Analytics show their data period. Use a labeled latest-data date for demo windows unless Nova supplies an authoritative as-of date. Never infer overdue status from the computer's date; use Nova status fields.
- Cash position comes from each account's latest unambiguous statement balance, ordered by date and line number, or opening balance plus movements when necessary.
- Resolve counterparties from linked source records, then cached name matching and documented name.ilike searches. Ambiguous names stay unresolved.

## Existing screens and integration changes

| Existing component | Integration |
| --- | --- |
| Navigation and HeroBipartiteHeader | Real sync progress, current totals, data timestamp, configuration and failure states. |
| DashboardView | Server-derived ledger and analytics; dynamic account filters; evidence, transfer/duplicate/recurring indicators; visible fraud summary. Replace unsupported ITC totals with a supported metric while retaining the card design. |
| ReviewQueueView | Persist accept/correct/reassign decisions and reuse corrections; show pending/manual entries and mutation errors. |
| DecisionTraceView | Retain animated nodes and inspection panes; build their content from stored processing events delivered by SSE. Label replay explicitly; include skipped stages and evidence. |
| SharePageView | Real /share/:token route; fetch only that token's record; no token picker, approval controls, dashboard navigation, or fallback transaction. |
| FraudAlertView | Evidence from changed beneficiary records and subsequent vendor payments; local acknowledge/review actions. Do not claim actual payment freezing or penny-drop verification. |
| VoiceNoteView | Browser speech recognition with typed-transcript fallback; extract and confirm details; persist pending manual entries and explicitly confirm later bank matches. |
| VoiceChatView | Microphone plus typed input; supported queries over stored data; spoken answers and persisted exchanges. Remove canned financial facts. |

## Trace and beneficiary alerts

Persist fetched, normalized, match, rule, model, review/final, and warning events with transaction and run IDs. SSE streams these records into the existing graph, supports disconnect cleanup, and can replay a completed run. Graph details must reflect actual evidence, not invented reasoning or a static architecture scenario.

A shared fraud-check function joins vendor-bank-account master changes, beneficiary accounts, and subsequent vendor payments. Use a configurable seven-day change-to-payment window; distinguish successful, failed, and reversed payments. Show verified status only when present in Nova and flag missing details as unknown. Trace rendering calls this same function's results. A local acknowledgement cannot change Nova's verification or payment status.

## Sharing and application access

Generate cryptographically random share tokens, persist the source resource and ID, and return a copyable URL. Resolve and re-fetch the single Nova record server-side. Invalid or invisible records receive the same unavailable page; failures never display another transaction. Return only the intended transaction summary and its classification citation, not the full source response.

Default local operation binds to loopback. Before exposing the application publicly, protect private data and mutation endpoints with operator authentication while leaving only token-specific share access public. A share link works only while its server is reachable; generating a local URL does not publish the app.

## Voice and supported questions

Browser speech recognition captures live speech where supported; it does not transcribe arbitrary uploaded recordings. Initial delivery includes recording and a typed fallback. Audio-upload transcription requires a configured server transcription provider and is an explicit optional addition.

Support cash position, review queue count, spending by category for the displayed data week, and overdue obligations. Use statutory-dues plus documented overdue invoices/purchase bills for a broader overdue answer, or clearly name the available subset. Unsupported questions receive a clear spoken limitation, not a guessed answer. Voice intake entries remain local pending records until matched to a real bank transaction.

## Verification and delivery order

1. Client and database foundation: test paging, auth headers, single-record unwrapping, retries, absent records, and request validation. Verify health and /me live once configured.
2. Ingestion and classification: test paise arithmetic, linked-source precedence, ambiguous matches, correction reuse, LLM validation, transfer pairing, duplicates, and recurrence coverage.
3. UI integration: persist reviews across reloads, derive totals from current records, exercise empty and partial-failure states, and preserve the existing layout.
4. Traces, sharing, and fraud: verify replay represents stored events, warnings agree across views, invalid tokens expose nothing, and public responses contain only the shared record.
5. Voice: verify text fallback, browser permission errors, pending-entry persistence, confirmed matching, supported questions, and unavailable-data answers.
6. Run type checking, production build, backend integration tests, and browser checks. Report live API/LLM/microphone checks separately from fixture tests.

## Inputs needed

- Framework preference: retain React/Vite with Express (recommended), or migrate to Next.js.
- Nova access: provide NOVA_API_KEY through the project's server-only .env; do not paste the secret in chat.
- LLM provider and model preference. Until configured, preserve unresolved rows in review instead of simulating model results.

The design is ready for review. Framework/provider choices can be incorporated without changing the proposed UI reuse or Nova data boundary.
