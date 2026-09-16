# DailyProof

Responsive habits, one-off tasks, calendar, private proof, friend accountability, reminders, and a Gemini planning assistant. The source of truth is [the V1 specification](docs/DAILYPROOF_V1_SPEC.md).

## Architecture

- Existing Next.js App Router, React, TypeScript, Tailwind, and desktop/mobile layouts.
- Supabase Auth, Postgres RLS, private Storage, and existing Realtime feed.
- `lib/actions/` authenticates operations. `lib/work-service.ts` and the transactional `apply_work_actions` RPC serve both manual task/reminder controls and reviewed AI plans.
- Persisted IANA timezone plus `lib/timezone.ts` define calendar days; timestamps use UTC. Nonexistent or ambiguous manually entered DST times are rejected.
- FullCalendar renders month/week/day views. Week view scrolls on phones. Commitments do not affect completion; scheduled tasks remain single task records.
- Private proof images use 60-second signed read URLs. Sharing requires an accepted friendship, owner detailed-activity and proof-sharing preferences, and the individual proof's friends visibility.
- Backend notification claims, leases, retry limits, and stable OneSignal idempotency keys protect against concurrent duplicate delivery requests.
- Gemini proposes allowlisted actions through application services. Users review plans before atomic application. Ownership, overlap, due dates, duration, expiry, and stale edits are checked. AI cannot move fixed commitments. Proof assessment is advisory, not fraud-proof.

## Local setup

Use Node.js 22 or 24 and npm. On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

```sh
npm ci
# Create .env.local from .env.example only if it does not already exist.
npm run dev
```

Preserve existing Supabase configuration. Add missing variables to the existing file; never overwrite it with the example. Restart after environment changes.

### Environment variables

Use this inventory for the intended deployment environment. Local files do not establish hosted configuration; see the [P0 production verification runbook](docs/P0_PRODUCTION_VERIFICATION.md).

| Variable | Obtain from | Set in | Server-only? |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Existing Supabase project's Connect/API settings | `.env.local` and Vercel | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Existing Supabase public anon key | Both | No; RLS protects data |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Settings → API Keys → legacy `service_role`, or equivalent elevated server secret | Both for local worker testing and deployed delivery | **Yes** |
| `ONESIGNAL_APP_ID` | OneSignal app → Settings → Keys & IDs | Both | No; returned to browser SDK |
| `ONESIGNAL_REST_API_KEY` | Same page → App API Key | Both | **Yes** |
| `GEMINI_API_KEY` | Google AI Studio → API keys | Both | **Yes** |
| `GEMINI_MODEL` | Available Gemini model ID supporting images and structured JSON, from AI Studio/model docs | Both | Server configuration; not a secret |
| `GEMINI_FALLBACK_MODEL` | Distinct available model ID supporting images and structured JSON; required for the V1 fallback release gate | Both | Server configuration; not a secret |
| `CRON_SECRET` | Generate at least 32 random bytes locally; save directly into your secret manager/environment | Vercel; also local for worker testing | **Yes** |
| `APP_URL` | Your canonical HTTPS deployment origin, without trailing slash | Both; local origin for local testing | No; used in push links |

Hosted variable presence has not been verified in this run. Manual tasks, calendar, proof, and friends do not require Gemini or OneSignal credentials, but do require their migrations. The worker never falls back to the public anon key.

Official references: [Supabase keys](https://supabase.com/docs/guides/getting-started/api-keys), [OneSignal keys](https://documentation.onesignal.com/docs/en/keys-and-ids), [Gemini keys](https://ai.google.dev/gemini-api/docs/api-key), [Gemini models](https://ai.google.dev/gemini-api/docs/models).

## Supabase migrations

The foundation migration `20260914000000_foundation_repair.sql` is already applied remotely, per the specification. Preserve it. Review and apply these new migrations in order:

1. `20260914100000_tasks.sql`
2. `20260914110000_calendar.sql`
3. `20260914120000_proofs.sql`
4. `20260914130000_notifications.sql`
5. `20260914140000_ai_operations.sql`
6. `20260914150000_daily_integration.sql`
7. `20260914160000_v1_hardening.sql`

The user reports P0-A (R-01/R-02/R-03) implemented and production-tested. Also account for additive migrations `20260915100000_enqueue_due_notifications.sql` and `20260915110000_coordinated_task_rescheduling.sql`. Verify actual hosted migration history before applying anything: check `supabase migration list`, then review `supabase db push --dry-run` against the intended project. Do not replay already-applied migrations.

The repository lacks the original baseline migration. `tests/fixtures/base-schema.sql` reconstructs that baseline for tests and must **never** be deployed. A fresh unrelated database requires the original project schema first.

The proof migration creates a private `proofs` bucket allowing PNG/JPEG/WebP up to 5 MB, with Storage ownership/sharing policies. New tables have ownership RLS and foreign keys. The hardening migration explicitly removes broad Supabase default grants before restoring protected notification/AI column permissions.

## OneSignal and reminders

1. Create a OneSignal app and configure Web Push for the exact production HTTPS origin. Use a separate app/origin for staging or local subscriptions where needed.
2. Set the App ID and App API Key using the variables above.
3. Configure `/OneSignalSDKWorker.js`, already included, as the service worker. Do not add an automatic provider permission prompt.
4. Open Notifications → **Enable push on this device**, approve permission, and save preferences. Each device needs permission and an active subscription.
5. On supported iPhones, add DailyProof to the Home Screen and open that installed web app first. The manifest and icons support installation; physical-device push still needs verification.
6. Set the privileged Supabase key, `CRON_SECRET`, and `APP_URL` for the worker.
7. Verify the existing **Supabase Cron** job runs every minute (`* * * * *`) and makes an HTTP **GET** request to the deployed `/api/cron/reminders` endpoint with `Authorization: Bearer <CRON_SECRET>`. The scheduler secret must match the server environment. Keep it in the existing protected scheduler secret store; never commit it or print the job command. The repository does not include `vercel.json` or provision this hosted job.

Supabase Cron is the intended scheduler; Vercel hosts the authenticated worker endpoint. A cron SQL execution being successful alone does not establish HTTP success or push delivery. Verify the HTTP response, worker logs, notification state and OneSignal delivery. Do not create a second scheduler or change the existing production job without checking its configuration. See the [production runbook](docs/P0_PRODUCTION_VERIFICATION.md).

Delivery uses five-minute leases, at most six attempts, exponential retry delays, and a 24-hour retry window. Failure records remain visible. Conditional reminders skip completed/cancelled tasks or completed habit logs. Push previews are generic; private contents stay inside the authenticated app. Nudges persist history and attempt delivery; provider failures do not fail the nudge itself, and cron retries pending work.

OneSignal web does not support its mobile identity-verification flow. This integration uses an opaque, owner-only random alias instead of the public Supabase user ID. Do not expose aliases in friend data. See [Web setup](https://documentation.onesignal.com/docs/en/web-sdk-setup) and [identity verification](https://documentation.onesignal.com/docs/en/identity-verification).

## Gemini

Set `GEMINI_API_KEY` and `GEMINI_MODEL` server-side. Select an available image/structured-JSON capable model and configure provider quota/billing. No potentially retired model is hardcoded. The app limits each account to 20 AI requests per hour.

For the V1 fallback release gate, set `GEMINI_FALLBACK_MODEL` to a different available model ID. The code permits it to be absent for older configurations, but that disables fallback and does not meet R-04. Each Gemini call shares a 25-second budget across both models, retries, and response transfer; with fallback configured, the primary gets at most 12.5 seconds. Each model makes at most three attempts for transient HTTP 429/500/502/503/504 failures. Exhausted transient failures or a primary provider timeout activate fallback. Other errors, including normal 4xx responses and invalid JSON, do not switch models. Both models receive the same image and structured-JSON request. Diagnostics contain model IDs and attempt metadata, never prompts or provider bodies. Set the variable in Vercel Production and redeploy to enable it there. A blank value or a value equal to `GEMINI_MODEL` does not activate a second model.

The assistant explains that relevant private work data goes to Gemini. Proof assessment sends the selected proof plus its associated activity. External proof links are not fetched. Manual controls remain available if Gemini fails. Live responses, model availability, and billing have not been tested without credentials.

## Validation

```sh
npm run typecheck
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:ui
npm audit
```

Tests cover pure domain logic and PGlite migrations/RLS. UI checks render actual components with synthetic action fixtures at 375, 390, 430, and 1280 px, including key interactions. Screenshots go to ignored `out/mobile-check/`. These are not live Supabase/Storage/provider or physical-device tests.

See [V1 validation and manual release checks](docs/V1_VALIDATION.md).

## Vercel release

1. Back up and apply the reviewed migrations to the existing project using the normal release process.
2. Add variables to the intended Vercel environments. Redeploy after public/build-time variable changes.
3. Preserve Supabase Auth site URL/redirect settings; add intended staging origins.
4. Verify the existing Supabase Cron minute schedule, authenticated GET delivery to the worker, and matching OneSignal origin/`APP_URL`.
5. Deploy using the existing Next.js preset; perform the two-account and real-device checklist.
6. Inspect notification history, Supabase Cron execution/HTTP results, Vercel function logs, and provider dashboards before considering delivery operational.

Revoking proof sharing blocks new authorized reads immediately. Previously issued signed URLs can remain usable for up to 60 seconds, and downloaded content cannot be recalled.
