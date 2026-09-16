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

A names-only inspection on September 15, 2026 found `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` locally. No secret values were printed. Hosted Vercel variables were not inspected.

| Variable | Obtain from | Set in | Server-only? |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Existing Supabase project's Connect/API settings | `.env.local` and Vercel | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Existing Supabase public anon key | Both | No; RLS protects data |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Settings → API Keys → legacy `service_role`, or equivalent elevated server secret | Both for local worker testing and deployed delivery | **Yes** |
| `ONESIGNAL_APP_ID` | OneSignal app → Settings → Keys & IDs | Both | No; returned to browser SDK |
| `ONESIGNAL_REST_API_KEY` | Same page → App API Key | Both | **Yes** |
| `GEMINI_API_KEY` | Google AI Studio → API keys | Both | **Yes** |
| `GEMINI_MODEL` | Available Gemini model ID supporting images and structured JSON, from AI Studio/model docs | Both | Server configuration; not a secret |
| `GEMINI_FALLBACK_MODEL` | Optional distinct model ID supporting images and structured JSON, from the same Gemini project's available models | Both | Server configuration; not a secret |
| `CRON_SECRET` | Generate at least 32 random bytes locally; save directly into your secret manager/environment | Vercel; also local for worker testing | **Yes** |
| `APP_URL` | Your canonical HTTPS deployment origin, without trailing slash | Both; local origin for local testing | No; used in push links |

The seven integration variables were missing locally. Manual tasks, calendar, proof, and friends do not require Gemini or OneSignal credentials, but do require their migrations. The worker never falls back to the public anon key.

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

These new migrations have **not** been applied remotely. Use the existing project workflow: check `supabase migration list`, then review `supabase db push --dry-run` against the intended project before applying.

The repository lacks the original baseline migration. `tests/fixtures/base-schema.sql` reconstructs that baseline for tests and must **never** be deployed. A fresh unrelated database requires the original project schema first.

The proof migration creates a private `proofs` bucket allowing PNG/JPEG/WebP up to 5 MB, with Storage ownership/sharing policies. New tables have ownership RLS and foreign keys. The hardening migration explicitly removes broad Supabase default grants before restoring protected notification/AI column permissions.

## OneSignal and reminders

1. Create a OneSignal app and configure Web Push for the exact production HTTPS origin. Use a separate app/origin for staging or local subscriptions where needed.
2. Set the App ID and App API Key using the variables above.
3. Configure `/OneSignalSDKWorker.js`, already included, as the service worker. Do not add an automatic provider permission prompt.
4. Open Notifications → **Enable push on this device**, approve permission, and save preferences. Each device needs permission and an active subscription.
5. On supported iPhones, add DailyProof to the Home Screen and open that installed web app first. The manifest and icons support installation; physical-device push still needs verification.
6. Set the privileged Supabase key, `CRON_SECRET`, and `APP_URL` for the worker.
7. Deploy `vercel.json`, which invokes `/api/cron/reminders` every minute. Vercel sends `Authorization: Bearer CRON_SECRET`.

**Hosting constraint:** Vercel Hobby's daily cron cannot satisfy minute-level reminders. The included schedule needs a Vercel plan supporting that frequency, or an independently configured scheduler calling the same authenticated endpoint every minute. No plan was purchased or changed. See [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Delivery uses five-minute leases, at most six attempts, exponential retry delays, and a 24-hour retry window. Failure records remain visible. Conditional reminders skip completed/cancelled tasks or completed habit logs. Push previews are generic; private contents stay inside the authenticated app. Nudges persist history and attempt delivery; provider failures do not fail the nudge itself, and cron retries pending work.

OneSignal web does not support its mobile identity-verification flow. This integration uses an opaque, owner-only random alias instead of the public Supabase user ID. Do not expose aliases in friend data. See [Web setup](https://documentation.onesignal.com/docs/en/web-sdk-setup) and [identity verification](https://documentation.onesignal.com/docs/en/identity-verification).

## Gemini

Set `GEMINI_API_KEY` and `GEMINI_MODEL` server-side. Select an available image/structured-JSON capable model and configure provider quota/billing. No potentially retired model is hardcoded. The app limits each account to 20 AI requests per hour.

Optionally set `GEMINI_FALLBACK_MODEL` to a different available model ID. Each Gemini call shares a 25-second budget across both models, retries, and response transfer; with fallback configured, the primary gets at most 12.5 seconds. Each model makes at most three attempts for transient HTTP 429/500/502/503/504 failures. Exhausted transient failures or a primary provider timeout activate fallback. Other errors, including normal 4xx responses and invalid JSON, do not switch models. Both models receive the same image and structured-JSON request. Diagnostics contain model IDs and attempt metadata, never prompts or provider bodies. Set the optional variable in Vercel Production and redeploy to enable it there.

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
4. Verify minute cron support and matching OneSignal origin/`APP_URL`.
5. Deploy using the existing Next.js preset; perform the two-account and real-device checklist.
6. Inspect notification history, Vercel cron/function logs, and provider dashboards before considering delivery operational.

Revoking proof sharing blocks new authorized reads immediately. Previously issued signed URLs can remain usable for up to 60 seconds, and downloaded content cannot be recalled.
