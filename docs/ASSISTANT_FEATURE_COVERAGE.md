# DailyProof assistant audit and implementation

This change extends the existing Next.js/Supabase/Gemini application. No deployment, hosted migration, production data mutation, Auth configuration change, or privacy-setting change was performed.

## Audit findings

The previous assistant could read current work, tasks, calendars, commitments, reminders, weekly progress, free slots and selected proof assessments. It could propose task/commitment/reminder writes, but every write required Apply. Habits, check-ins, deletion, proof submission, friends and notification controls were absent from the registry. Its three-turn loop handled reads only; it could not create an item and then act on its persisted identity. Read-result keys also collapsed different object arguments into `[object Object]`.

The original shared PostgreSQL operations already provided transactions, ownership, schedule constraints and reviewed-plan retry protection. These were extended rather than replaced. A retry bug in `SELECT ... FOR UPDATE` on applied plans conflicted with the pending-only UPDATE policy; receipt reads now use the existing owner advisory lock and SELECT permission. RLS remains enabled.

Mixed batches now check the final calendar after requested task/commitment/habit removals and habit timing changes. The shared transaction applies those changes before core schedule checks, then dependent proof/notification operations. Conflicts roll back the entire batch. This also allows deleting old work and reusing its slot regardless of proposal order.

Live synthetic Gemini checks exposed HTTP 400 rejection of the expanded constrained response schema and rejection of local timestamp strings containing seconds. The provider envelope is now shallow, with allowlisted operation names and JSON-encoded arguments. Exact per-operation field/type/range/required checks remain mandatory on the server. Provider array-length constraints were removed; server limits remain. Local timestamps with seconds and date-only task deadlines use the existing canonical timezone conversion. Google documents that complex schemas can be rejected: [structured output documentation](https://ai.google.dev/gemini-api/docs/structured-output).

## Feature-to-tool coverage

| Existing user-facing feature / operation | Assistant tools | Shared backend / source | Status |
| --- | --- | --- | --- |
| Dashboard current work, completed/incomplete work and integrated daily progress | `get_today` | `daily-progress`, `ai-context`, Calendar actions | Connected |
| Habit/month/year statistics, current/best streak, history | `get_habit_stats`, `get_habit_logs`, `get_week_stats`, `get_progress`, `summarize_weekly_performance` | Shared `stats` functions and timezone-aware activity context; paginated owner logs | Connected; habit-only and integrated metrics are labelled separately |
| Habit list, create/edit name/category/core flag/recurrence/time, remove time | `get_habits`, `create_habit`, `update_habit`, `set_habit_time` | Habit/Calendar actions → `executeWorkActions` → `apply_work_actions` | Connected |
| Starter habit list | `seed_starter_habits` | Same operation used by `seedStarterHabits`; empty-list check under owner lock | Connected |
| Habit complete/missed/rest/vacation, undo, yesterday correction | `log_habit` | `upsertHabitLog` → same shared operation; database local edit-window enforcement | Connected |
| Delete one habit / all habits | `delete_habit`, `delete_all_habits` | Same shared transaction; bulk review captures an owner-only snapshot | Connected; bulk always requires confirmation and stale snapshots are rejected |
| To-Dos: read/create/edit/due date/priority/description/complete/reopen/cancel/schedule/reschedule/delete | `get_tasks`, `create_task`, `update_task`, `complete_task`, `reopen_task`, `schedule_task`, `reschedule_task`, `delete_task` | Task actions and shared work service | Connected; cancellation uses `update_task(status=cancelled)` |
| Move unfinished tasks / coordinated task and reminder edits | Scoped task/reminder tools in bounded batches | Existing coordinated task scheduling transaction and optimistic timestamps | Connected; each batch is atomic, earlier committed batches are reported on later failure |
| Calendar fixed commitments: read/create/edit/delete | `get_calendar`, `get_commitments`, `create_commitment`, `update_commitment`, `delete_commitment` | Calendar actions and shared work service | Connected; commitments move only on an explicit request |
| Calendar availability, recommendations and planning | `find_free_slots`, `get_calendar`, current-work/statistics reads and scoped writes | Existing schedule/free-slot utilities and database overlap checks | Connected |
| Reminder read/create/edit/reschedule/cancel; conditional incomplete reminder | `get_reminders`, `create_reminder`, `update_reminder`, `reschedule_reminder`, `cancel_reminder` | Reminder actions and shared work service; existing scheduled worker | Connected; existing reminders are one-off, not recurring reminder rules |
| Notification history, read status, delivery preferences | `get_notifications`, `mark_notification_read`, `get_notification_settings`, `update_notification_settings`, `get_delivery_status` | Reminder/notification actions and same shared work service | Connected; settings do not grant browser push permission |
| Proof list, private note/link submission, deletion including images, selected evidence assessment | `get_proofs`, `add_proof`, `delete_proof`, `verify_proof` | Private note/link and all deletion actions use shared work service; existing proof assessment/ownership checks | Connected; proof requires completed work; assistant submission always private |
| Private proof image upload/open and per-proof sharing | Existing Proof UI and Storage actions | Signed upload/read URLs and persisted sharing policies | UI-only: chat has no attachment uploader; sharing controls are deliberately outside the model's tools |
| Friend search/request/accept/decline/cancel request/unfriend/nudge | `search_profiles`, `get_friends`, `send_friend_request`, `respond_friend_request`, `remove_friendship`, `send_nudge` | Friend/Nudge actions and same shared work transaction | Connected; model uses usernames or friendship IDs, never account IDs |
| Circle activity, friend history, leaderboard | `get_circle_activity`, `get_friend_summary`, `get_leaderboard` | Same authorized `get_friend_day_summary` RPC used by UI | Connected; default summary-only privacy, detailed data only if owner permits it |
| Own profile display | `get_profile` | Session-derived owner read of username/bio/avatar only | Connected; no Auth identity mutation |
| Login/signup/logout/passwords, timezone initialization, detailed-activity/proof privacy switches | Existing authenticated UI | Auth and preference actions | Deliberately excluded: no security, credential or sharing-setting tools |
| Navigation, Calendar view/date selection, habit category filters, mobile Grid/List, presentation preferences | Existing UI/localStorage | Client presentation state | UI-only; no database operation to execute |

## Execution and security

`runAssistant` is the UI entry point. Explicit ordinary requests execute without review; `askAssistant` remains available as the compatible proposal-only server action. Broad deletion/unfriending requires review. Bulk habit deletion uses one explicit tool rather than silently truncating a list to 20 actions.

The user's explicit request for automatic ordinary actions takes precedence over the older specification's review-every-plan wording. The existing proposal/Apply backend remains available; security and destructive confirmation boundaries remain enforced.

Limits: eight Gemini calls, six write batches, at most eight reads and twenty writes per response, sixty ordinary writes total, and a ninety-second execution budget. Existing per-provider timeouts/fallback and twenty account requests per hour remain. The page already allows 120 seconds. No model invocation can select a table, SQL statement, owner ID, Storage path, role, key or security setting.

HTTP 429 stops retries immediately for that model. A server-process circuit breaker skips exhausted models for `Retry-After` (bounded to 1 minute–24 hours), or five minutes when the header is absent/invalid. An available fallback can be tried once; if it also returns 429, later calls send no requests during the cooldown. Bounded retries remain for 500/502/503/504 and timeouts. The cooldown contains model names/times only; it is process-local and is not a project-wide distributed quota guarantee across serverless instances.

Identity comes from `requireUser`/`auth.uid()`. All backend writes run under the signed-in user's RLS and unchanged ownership/calendar triggers. Approval and execution use persisted plans and return success only after a committed RPC result or confirmed applied receipt. Client-generated request keys scope to the owner. Repeated applied requests do not generate another plan, nudge or proof. Failures before any plan/write may be atomically retried with the same key. Interrupted requests with uncertain state are blocked instead of blindly replayed. Pending plans can be retried through Apply safely.

The assistant keeps eight conversation turns. Account reads are requested as needed; planning questions additionally receive the existing incomplete-work snapshot. Context strips account identifiers, push aliases, Storage paths and internal error fields. Task/habit titles, selected proof contents and authorized tool results remain relevant private context sent to the configured Gemini provider; the UI discloses this. This is not a zero-data-disclosure/offline model mode. Retrieved content and earlier conversation are untrusted data and cannot grant permissions.

Successful changes invalidate task/calendar providers, habit/friend/notification settings listeners, notification history and route data. Partial completion includes the number of confirmed writes and retains any retryable pending plan.

Image-proof deletion queues Storage API cleanup atomically, including task/habit cascade deletion. Queue insertion requires an existing owned proof and an exact owner/proof path; its paths are not exposed to the model. Owner clients attempt cleanup; the existing authenticated cron worker also drains the queue using its established server-only client. Storage failure retains the queue and revoked proof metadata is never restored. Previously issued signed read URLs can remain valid for up to sixty seconds. Cleanup is bounded to fifty files and a four-second Storage wait per invocation.

## Verification and limits

The deterministic tests execute actual server actions and all migrations against isolated PGlite PostgreSQL with RLS active. Only Gemini responses, Supabase transport and external Storage/push APIs are adapted. Cases cover multi-step new identities, habit recurrence/time/check-ins/undo, timezone/DST, coordinated task/reminder edits, private proof, friend transitions/nudges, destructive confirmation/stale snapshots, failure/partial completion, repeated requests/Apply, owner isolation, blocked arbitrary fields and retryable Storage cleanup. Chromium tests cover Apply failure/retry/discard, immediate refresh and stale-read protection at 375px and desktop widths.

Live Gemini successfully created the weekday 8 p.m. Reading habit and its linked 30-minute-before reminder in isolated PostgreSQL after the schema/date fixes. Expanded live checks subsequently encountered HTTP 429 on both configured models (and a fallback 503); those blocked commands are **not** reported as verified live. The paced fallback-only runner also encountered provider rate limiting. No live Supabase or actual OneSignal/device delivery was performed.

The existing reminder scheduler/enqueue/claim/lease/idempotency/history/failure/retry path is exercised by the database and worker regression tests. Creating a reminder is not a claim that a device received a push. Actual delivery additionally requires the setup below.

Current work uses mocked Gemini responses only. **Live AI verification is BLOCKED by provider quota; full end-to-end verification remains incomplete.** Mocked responses verify orchestration, validation, authorization and actual local persistence, but cannot prove how Gemini interprets arbitrary natural language. No additional live requests were sent during this continuation. Paid billing is not required for the offline implementation/checks.

Final local regression result: **222 passed, zero failed, one live-provider test skipped** (223 total), recorded in `out/assistant-feature-regression.log`. The added offline cases cover quota suppression/expiry/fallback, replacing deleted scheduled work atomically, rejecting new habit/task conflicts, and moving unfinished work to the saved-zone tomorrow while preserving completed/foreign work and cancelling obsolete reminders. Typecheck passed. Lint passed with the pre-existing `postcss.config.mjs` anonymous-default-export warning. Production build passed after the final application changes.

History reads paginate five hundred rows. Statistics stop at ten thousand logs rather than fabricate a partial total. Habit/proof reference reads refuse a five-hundred-record result rather than silently treat it as complete. Circle activity paginates twenty users; the leaderboard has a hundred-friend execution limit. Recurring fixed commitments and recurring reminder rules are not app features. Image uploads and privacy/security changes remain explicit UI flows.

## Exact migration and deployment procedure

These are future release instructions, not actions performed during this task. First use an isolated staging project with the existing DailyProof baseline; never deploy `tests/fixtures/base-schema.sql`. A PGlite test pass is not proof of hosted migration history.

1. Use `supabase link --project-ref YOUR_STAGING_PROJECT_REF` for the explicitly selected staging project and verify that reference before any database command. Inspect `supabase migration list` and ensure existing migrations through `20260927120000_assistant_commitment_actions.sql` are already applied. Apply missing earlier application migrations in chronological order only after review; do not replay the completed foundation. A staging baseline needs the existing schema, not copied private user data.
2. Review `supabase db push --dry-run`. This change adds **`20261010120000_assistant_feature_operations.sql`**. It renames the prior operation function to `apply_work_actions_core`, adds the narrow operation wrapper, rebinds the plan function, and creates owner-protected request receipts and file-cleanup queues. It must run once through normal migration tracking; do not execute it repeatedly by hand.
3. On the explicitly verified staging project, run `supabase db push`. Apply the migration before deploying the updated app: the new client/server code requires these functions/tables. Back up first under the normal release process.
4. Keep the existing Supabase Auth URL/redirect configuration and Next.js deployment preset. No new dependencies or environment secrets are required.
5. Verify `GEMINI_API_KEY`, a structured-output-capable `GEMINI_MODEL`, and `GEMINI_FALLBACK_MODEL` in staging. The live run observed provider rate limiting on both models; resolve the provider project's quota/billing/model availability before claiming uninterrupted execution. Do not change real configuration just to bypass a failed test.
6. Verify `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`, server-only `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL` and `CRON_SECRET`. Keep secrets out of public variables and model contexts. Existing Supabase Cron must invoke `GET /api/cron/reminders` every minute with the matching bearer secret. This task neither provisions nor changes a hosted scheduler. The same worker now also handles queued proof files.
7. Configure the exact staging HTTPS origin in OneSignal. In Notifications, explicitly enable push on each test device and save enabled preferences. On supported iPhones use the installed Home Screen app. The assistant cannot grant browser/device permission.
8. Deploy to staging using the existing Next.js/Vercel workflow. Repeat the two-account RLS/privacy checklist and representative assistant requests. For a scheduled reminder verify its notification history, cron HTTP response, OneSignal event and physical device receipt. Test a provider/Storage failure and retry.
9. A production release requires a separate explicit authorization. None was requested or performed here.

Local checks:

```powershell
npm.cmd run typecheck
npm.cmd run lint
node --test tests/*.test.mjs
node node_modules/next/dist/bin/next build
```

Opt-in live provider checks (synthetic data only; may consume Gemini quota):

```powershell
node scripts/assistant-live.mjs
# Only after quota is available, explicitly permit retry of a previously blocked check.
node scripts/assistant-live.mjs --retry-after-quota
# Optional: choose the configured fallback only for this test process.
node scripts/assistant-live.mjs --retry-after-quota --fallback-only
```

The runner records HTTP 429 in `out/assistant-live-quota-blocked.json`. Subsequent runner invocations stop before loading credentials or sending requests unless `--retry-after-quota` is explicitly supplied. The current workspace has that marker from the prior quota-exhausted checks. Do not retry while provider access remains blocked. The runner loads `.env.local` without printing its secrets, adds pacing between model calls and uses isolated local PostgreSQL. It never contacts remote Supabase, applies hosted migrations or modifies production data.
