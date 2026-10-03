# Radix LedgerLens

Finathon FIN-19 prototype using the existing Radix UI, React/Vite, a local Express server, SQLite, Account Aggregator (AA) Bank Sync, and Gemini 3.8 Flash.

## Run locally

Requires Node.js 24 or later (the database uses Node's built-in SQLite).

```sh
npm install
```

Copy `.env.example` to `.env` if `.env` does not already exist. Set `NOVA_API_KEY` and `GEMINI_API_KEY`; retain `GEMINI_MODEL=gemini-3.8-flash`. Keys belong only in this ignored server file, never in a `VITE_` variable. The provided keys are already configured on this machine.

```sh
npm run dev
```

Open http://127.0.0.1:3005 and select **Sync Bank Feed**. The existing Express server runs Vite, the application API, and the voice routes together in one process. Completed imports are retained across restarts. Account Aggregator (AA) Bank Sync calls are GET-only, paginated, cached for the server session, and retried on supported transient failures. Each sync checks the team identity again. The supplied dataset is fixed; dates and analytics are anchored to the latest statement date.

To run the production build locally:

```sh
npm run build
npm start
```

Stop the development server before starting the production server on the same port.

## Hands-free calls

Set `PORT=3005`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `PUBLIC_BASE_URL`, and `NGROK_AUTHTOKEN` in the ignored root `.env` (see `.env.example`). Run `npm install` after pulling changes. On this machine, the voice credentials and ngrok authentication are already configured.

From the project directory, run the app:

```sh
npm run dev
```

In a second terminal, expose the same app port:

```sh
ngrok http 3005
```

Open the HTTPS URL, select **Voice Assistant**, and press **Call**. The greeting plays through ElevenLabs, then browser speech recognition listens in `en-IN`. Each recognized question is answered aloud and listening resumes automatically. **Hang Up** cancels playback, recognition and pending browser requests. Permission, network and unsupported-browser errors appear above the call controls. Chrome or Edge with a microphone is needed for calls; typed questions remain available separately.

`server/index.ts` mounts the root `server.ts` voice module before Vite/static middleware. `GET /voice/greeting`, `POST /voice/process`, and `GET /audio/:id` all use port **3005**. Vite HMR shares that same HTTP server. No separate voice process, port 4000 listener, or `/voice`/`/audio` proxy is used. Set `PUBLIC_BASE_URL` to the ngrok HTTPS URL, then restart the dev server; Vite and the API allow that configured public host.

Calls and typed questions use the same imported Account Aggregator (AA) Bank Sync transactions as Analytics. Dated and relative cash-flow questions use the Analytics row filters and exclude internal transfers. Questions outside the imported statement range state the available dates instead of substituting the latest balance.

ElevenLabs uses `eleven_flash_v2_5` with a 20-second provider timeout. Successful MP3s are cached in memory and reused. Call audio, typed questions, quick prompts, and replay all use MP3s returned by the server. Failed synthesis or MP3 playback shows an error in the Voice Assistant; browser speech synthesis is not used. No file under `src/` imports the server module or accesses the voice/ngrok secret environment variables. Typed history is saved in SQLite; call transcripts remain in the current view.

## Hosting and updates

The production build runs the same Express process for the UI, API, `/voice/*`, and `/audio/:id`. The included Dockerfile pins Node 24 and builds the Vite assets. Production binds to `0.0.0.0` on `PORT` (default 3005); local development remains on `127.0.0.1:3005`. `/health` is the unauthenticated host health check.

For a GitHub-connected Railway service, attach a persistent volume at **`/app/data`** before importing any records. The SQLite file, reviews, voice notes, and share links live there. Configure `PORT=3005`, `PUBLIC_BASE_URL=https://<your-public-domain>`, `NOVA_API_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY` as service variables. The two `VITE_` values are public browser configuration built into the client; all other API keys stay server-side. Never commit `.env` or the `data/` directory. Set `/health` as the health-check path. Connect the GitHub repository's `main` branch with automatic deployments and enable **Wait for CI** so failing tests block updates. The included GitHub Actions workflow runs tests, type checking, and the production build on every push to `main`.

After the host assigns a public HTTPS domain, add that exact origin and `<origin>/reset-password` to Supabase Auth → URL Configuration. Set Site URL to the hosted origin. Google's OAuth callback remains the Supabase project callback (`https://whymttviymdbrdumwsmb.supabase.co/auth/v1/callback`); add the hosted origin to Google Cloud's Authorized JavaScript origins. Then set `PUBLIC_BASE_URL` to the hosted origin and redeploy. Subsequent `git push origin main` updates the site automatically. A volume-backed service can have a short restart during deployment.

## Features

- Multi-account ingestion, signed integer-paise calculations, linked accounting evidence, unique fallback matches, rules, and Gemini classification of residual entries.
- Counterparty matching against cached client/vendor data, internal-transfer pairing, recurring patterns, subscription insights, and possible-duplicate flags.
- Cash history, spending by category, top counterparties, review trend, search, filters, sorting, and pagination.
- Financial Analytics tab with date and bank filters, six live metrics, a clickable calendar heatmap, daily transaction drilldowns, bank statement comparisons, and subscription amount checks. Drilldown lines open their recorded Decision Trace.
- Persistent human reviews with correction reuse; conflicting source evidence stays visible for review.
- Decision Trace replays actual stored evidence through server-sent events. It is labelled as replay and does not invent model reasoning or processing times.
- One-transaction share pages with random tokens and a fresh Account Aggregator (AA) Bank Sync record check. Unknown tokens reveal nothing.
- Beneficiary-change warnings based on subsequent payments, plus local acknowledgement/review actions.
- Microphone input through browser speech recognition, editable typed fallback, pending notes, and explicit amount-matched bank reconciliation.
- Financial questions about cash, reviews, the displayed data week's spending, overdue obligations, and beneficiary risk; answers use imported records and can be spoken aloud.

Data is stored in ignored `data/ledgerlens.sqlite`, partitioned by the Account Aggregator (AA) Bank Sync team and dataset. Back up this directory if preserving reviews, notes, and share tokens matters. The API keys and data are excluded from the browser build.

## Prototype boundaries

Development binds to `127.0.0.1:3005`; production binds to `0.0.0.0` on its configured port. Ngrok remains an option for local demos. LedgerLens requires a Supabase session for its dashboard, API, voice, and audio routes. Public transaction share links remain accessible by token. Every signed-up account currently sees the same Account Aggregator (AA) Bank Sync dataset and shared review/note state.

## Supabase sign-in

The sign-in and signup screen uses the existing LedgerLens signup UI. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (or `VITE_SUPABASE_ANON_KEY`) in the root `.env`, then restart `npm run dev`. Find these values in Supabase Project Settings → API Keys. Do not put a service-role or secret key in a `VITE_` variable.

For this project, use these exact settings in Supabase Authentication → URL Configuration:

- Site URL: `http://127.0.0.1:3005/`
- Redirect URLs: `http://127.0.0.1:3005/`, `http://127.0.0.1:3005/reset-password`, `https://reassign-pulse-wolf.ngrok-free.dev/`, and `https://reassign-pulse-wolf.ngrok-free.dev/reset-password`.

Enable Google under Authentication → Providers and enter a Google Web OAuth Client ID and Client Secret. In Google Cloud, add `http://127.0.0.1:3005` and `https://reassign-pulse-wolf.ngrok-free.dev` as Authorized JavaScript origins, and `https://whymttviymdbrdumwsmb.supabase.co/auth/v1/callback` as the Authorized redirect URI. The callback is for Google Cloud, while the application URLs are for Supabase URL Configuration. Email signup can require confirmation, depending on the project setting. All authenticated accounts currently view the same demo LedgerLens dataset.

The app cannot freeze payments, perform bank verification, or establish GST eligibility. Fraud alerts are review warnings. Browser speech support and microphone permission vary by browser; typed input remains available. Arbitrary audio-file uploads are not implemented.

Gemini failures are displayed and leave unresolved entries in review. No other model is silently substituted. At verification on 2026-09-30, Account Aggregator (AA) Bank Sync imported **1,396 transactions across five accounts**, through **2026-09-29**. Gemini voice-note extraction succeeded in the browser. Transaction classification still returned **HTTP 503** after retries, so the 345 residual transactions remain without model suggestions and the review queue contains 522 items.

## Verification

```sh
npm test
npm run lint
npm run build
```

Automated tests cover Account Aggregator (AA) Bank Sync pagination/cache/retries, source precedence, exact amounts, transfer ambiguity, correction persistence, fraud windows, model-output validation/retries, SQLite restart/team isolation/rollback, failed-sync retention, review/share/note flows, origin rejection, trace streaming, Analytics calculations, configured ngrok origins, all voice intents, MP3 serving, TTS failure fallback, continuous call sequencing, microphone errors, and hangup cancellation. Live microphone capture requires a user microphone and has not been verified.

