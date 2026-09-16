# Remaining P0 production verification

This is the execution runbook for R-04, R-05, VS-01, VS-03, VS-04, VS-08 and VS-22. Status lives only in [V1_RELEASE_BACKLOG.md](V1_RELEASE_BACKLOG.md). No hosted configuration, deployment, secret inspection or provider test was performed during this local implementation. R-01/R-02/R-03 are already production-tested per the user; do not reimplement or replay them.

## Configuration inventory (R-04/R-05)

Record the intended Supabase project, Vercel project/environment, deployed revision and verification date. Inspect **presence and environment scope**, never copy credential values into evidence. `.env.local` was not inspected.

| Variable | Required production configuration |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Existing intended Supabase project URL; rebuild if changed. |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Public key for that same project; rebuild if changed. |
| SUPABASE_SERVICE_ROLE_KEY | Existing project's privileged server key, server-only. No public-key fallback. |
| ONESIGNAL_APP_ID | Web Push app configured for the exact production origin. |
| ONESIGNAL_REST_API_KEY | Server-only API key for that same OneSignal app. |
| APP_URL | Canonical production HTTPS origin, without trailing slash. |
| CRON_SECRET | Nonempty server-only bearer secret, exactly matching the existing scheduler's protected value. |
| GEMINI_API_KEY | Server-only key with access/quota for both configured models. |
| GEMINI_MODEL | Available model ID supporting image input and structured JSON. |
| GEMINI_FALLBACK_MODEL | **A nonempty available model ID distinct from GEMINI_MODEL**, supporting the same image/structured-JSON request. Set in Vercel **Production**, then redeploy. |

The precise fallback model ID cannot be determined from this repository without the project's model-availability/configuration inventory. Select it from the Gemini project's available models and record the **model ID only**, not the API key. Do not put a placeholder into Production. No model name is hardcoded or guessed. Missing or identical fallback disables the second model; setting this variable locally is not evidence of hosted configuration.

## Hosted foundations and scheduler (R-05)

1. Compare the intended project's migration history with `supabase/migrations/`. Confirm the two P0-A additive versions are recorded through the established migration workflow. Never deploy `tests/fixtures/base-schema.sql` or replay the foundation. This batch adds no migrations.
2. Verify Supabase Auth Site URL and allowed redirects match production and deliberately supported preview origins. Verify the `proofs` bucket remains private, with existing owner/sharing policies. Confirm existing RLS and worker-only function grants remain intact.
3. Inspect the **existing Supabase Cron** job. Confirm one active intended reminder job, cadence `* * * * *`, and an authenticated HTTP **GET** to `https://<production-origin>/api/cron/reminders`. A POST is not supported by the current route. Confirm the protected bearer value matches `CRON_SECRET`; do not output the full job command or secret-bearing headers. Do not provision a duplicate job.
4. Safe scheduler inventory may include `select jobid, jobname, schedule, active from cron.job;`. Inspect recent run timestamps/statuses without exporting secret-bearing command text. If the existing job uses asynchronous HTTP, separately verify its HTTP result: successful SQL dispatch alone does not mean a 200 response. Use the existing job's HTTP-result/log mechanism; do not assume a particular extension schema or secret name without inspecting it.
5. Call the deployed worker without a bearer and with an incorrect synthetic bearer: both must return **401**, with no delivery work. Through the authorized scheduler path, confirm **200** and the expected processed count. A worker failure should return **503** with a generic error and retain records for retry.
6. Verify OneSignal origin, App ID, service-worker path `/OneSignalSDKWorker.js`, explicit permission and the test device subscription. Create one short test reminder, close the app and observe one history record and one push, then open it into `/notifications`. Exercise disabled preferences, conditional completed targets and a controlled provider failure/recovery in an isolated staging environment. Confirm retained failed records, bounded retry/exhaustion and stable notification IDs; never disrupt production users to inject faults.
7. Record names-only configuration inventory, revision, migration versions, cron cadence, observed HTTP statuses and notification/provider outcome. Actual hosted inspection remains required; passing local tests does not close R-05.

## Gemini primary and fallback (R-04)

1. Verify the deployed revision includes `lib/gemini.ts`, with distinct valid server model IDs and access for the same key. Run a normal structured assistant request and an owned image-proof assessment against the primary. Verify the reviewed action path and image result work normally.
2. In an isolated deployed test environment with controlled transport fault injection, exhaust primary 503 retries and separately force a primary timeout. Confirm fallback success returns the same structured format, including an image request. Do not use an invalid model ID to simulate transient failure: a normal 4xx must not activate fallback.
3. Verify primary 503 followed by success stays on primary; fallback retries transient failures; both models failing returns the safe assistant error; 400/401/403 do not switch models. Total provider call time must remain within the shared 25-second budget (allow transport/UI overhead separately); primary timeout must leave fallback time.
4. Correlated server diagnostics must contain role, model, attempt, HTTP status (null for timeout), fallback activation and correlation ID. Never capture prompts, private work, API keys or raw provider bodies. Confirm manual task/habit/calendar/reminder/proof controls continue to work when AI is unavailable.

## State correctness checks (VS-01/03/04/08/22)

Use dedicated test accounts and browser network interception/throttling. Repeat on approximately 375px mobile and desktop.

1. **VS-01:** save known notification preferences including enabled/friend activity/nudges/time. Reopen with the settings read delayed, then failed. Unknown controls must not imply disabled or allow Save/Enable push. Retry must restore the exact saved values. No default preference write may occur before successful loading.
2. **VS-03:** edit settings without saving and wait through a minute poll. Edits/focus must remain. Enable push with a dirty form: saved unrelated preferences must remain unchanged and draft edits must survive. Save during delayed list polling; release an older response afterward. Saved state must not revert. Reminder writes refresh reminders; mark-read refreshes history; neither reloads settings. Calendar choices load when opening the reminder editor. Edit an existing linked reminder while choices are delayed: its task/habit must stay selected. Verify failed saves keep the form editable with its draft, and reopening a form while an older save finishes does not close/reset the new draft.
3. **VS-04:** test saved proof sharing both enabled and disabled. Delay/fail initial reads; unknown must not appear disabled or accept writes. Retry, save, and fail a save: show an error and keep the last confirmed setting. Navigate away during a read, then back; older responses must not alter the current screen. With a second accepted account, verify persisted sharing and revocation through the existing server rules.
4. **VS-08:** click real task/habit Calendar events: destination should change through Next navigation, without a document reload or shell reconstruction. Ctrl/Cmd/Shift/middle-click retain browser behavior; fixed commitments still open their editor. Check back navigation and phone taps.
5. **VS-22:** fail habits, habit logs, friendships, profile joins, feed events, summary RPCs and streak RPCs individually. Initial errors must be visible, without empty-success or zero-success claims. A successful empty result must remain legitimately empty. After loading known cards/rankings/friends, inject a transient refresh failure: retain safe known data with an error. Recover and verify fresh values replace stale ones.
6. **VS-22 privacy/races:** revoke detailed sharing while a historical summary read fails; old detailed names/statuses must disappear. Remove friendship or return authorization denial while other requests fail; revoked cards/rankings must disappear. Remove/respond to a friend during a slow refresh; release the old response after success and confirm it cannot undo the mutation. Sign out/switch accounts during pending reads; the existing auth gate must unmount old user state and no private data may cross sessions.

Record actual results in the backlog. Only advance to DEPLOYED/MANUALLY VERIFIED/DONE when the corresponding evidence exists. This runbook does not authorize or implement P1/P2/P3.
