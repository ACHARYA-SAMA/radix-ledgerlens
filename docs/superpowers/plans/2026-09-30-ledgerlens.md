# LedgerLens Implementation Plan

> Execute inline using superpowers:executing-plans, with behavior tests and a final review.

**Goal:** Connect the existing LedgerLens UI to Nova, persistent local workflows, and Gemini 3.8 Flash.
**Architecture:** React/Vite + Express + SQLite, same-origin API and SSE. Keep keys on the server.
**Tech stack:** TypeScript, Node 24 built-in SQLite, Express, existing React components, Gemini REST API.
**Spec:** ../specs/2026-09-30-ledgerlens-integration-design.md

## Global constraints

Nova GET only; paginated at 200; integer paise; explicit evidence; no fabricated banking or tax actions. Unknown and unavailable data remain visible. Preserve the existing visual language. No public deployment requested.

## Review focus

Partial upstream failure must preserve usable data; unknown share tokens must never fall back to other records; ambiguous transfer and payroll matches need review; human corrections must survive sync; browser speech rejection needs a text fallback.

## Tasks

- [x] 1. Foundation: server/nova.ts exposes NovaClient.list(resource, params), get(resource,id), health(), me(); server/store.ts owns team-scoped SQLite snapshots and local records. Tests: auth/header isolation, pagination, retries, absence, persistence, team isolation. Run node --experimental-strip-types --test tests/*.test.ts.
- [x] 2. Engine: server/engine.ts normalizes source rows into shared domain types, attaches source/rule/human evidence, pairs transfers, identifies duplicate and recurring candidates, and computes analytics. server/fraud.ts supplies reusable beneficiary checks. Test exact paise sums, precedence, ambiguous pairs, date windows, duplicate references, unavailable resources.
- [x] 3. Gemini: server/gemini.ts exposes residual classification and note extraction, validates fixed categories/confidence, and safely routes unavailable/invalid output to review. Test malformed and low-confidence output.
- [x] 4. Service/API: server/service.ts coordinates imports and mutations; server/app.ts exposes state, sync, review, fraud acknowledgement, shares, voice notes, questions, and SSE. Tests cover persistence, invalid mutation, token isolation, origin checks, and meaningful question answers.
- [x] 5. UI integration: src/lib/api.ts and existing App/components use server state. Preserve styles, replace simulated actions and unsupported labels, display import/errors/empty states. Implement actual microphone input with typed fallback; source trace data from SSE. Run typecheck and build.
- [x] 6. Verification: run full tests, build, live import, API workflow checks, and browser inspection. Update README and this ledger with actual results and remaining configuration needs.

## Execution ledger

- User confirmed React/Vite and Gemini 3.8 Flash. Nova health and authenticated /me passed.
- Ruling: proceed inline under the user's existing implementation request and confirmed stack; no repeated approval gate for already authorized reversible work.
- Ruling: this directory is not a Git repository, so preserve files in place and do not create commits/worktrees.
- Ruling: use Node 24 built-in SQLite to avoid native dependency setup; local operation binds loopback.
- Pre-flight: API display models shared with the existing React types; engine uses separate signed integer amounts and adapts to display amounts.

- Implemented all six work packages in the existing React/Vite application. Local Express and SQLite supply real data and persistent workflows.
- Final automated verification: 17/17 tests passed; TypeScript check passed; Vite production build passed. Browser bundle scan found zero configured secret values.
- Live Nova verification: five accounts, 1,396 transactions through 2026-09-29; 522 review items, eight transaction risk flags. Full re-import passed.
- Gemini 3.8 Flash remains configured as requested. Live calls returned HTTP 503 after bounded retries; no live model result is claimed. Unresolved transactions stay in review.
- Independent implementation review identified transfer correction propagation, payroll/transfer precedence, identity refresh, and human/source conflicts. Fixed these and added regression checks. Session caching is intentional for Nova's static dataset; identities are rechecked and caches cleared on a team change.
- Trace transport streams stored evidence as explicitly labelled replay. It does not claim to be a live processing feed. Microphone capture and externally hosted sharing remain environment-dependent and unverified; the typed path and local token page are the prototype delivery.
- Browser verification passed: dashboard/pattern markers, category review choices, stored decision trace, beneficiary evidence, valid isolated share page, invalid-token error page, financial assistant cash answer, and typed voice-note extraction. Gemini successfully extracted Ramesh / INR 500 / vendor payment; the test note was discarded without saving. A subsequent full sync still returned HTTP 503 for transaction batches, with zero model-classified transactions. Final counts remain 1,396 / 522 review / eight risk flags.
