# DailyProof V1 validation and release checklist

Historical snapshot. The active tracker is [V1_RELEASE_BACKLOG.md](V1_RELEASE_BACKLOG.md); current deployment instructions are in [P0_PRODUCTION_VERIFICATION.md](P0_PRODUCTION_VERIFICATION.md). References below to Vercel cron, locally missing configuration, or unapplied migrations describe the September 15 audit, not current hosted state. The intended scheduler is now Supabase Cron; no `vercel.json` is present.

Date: September 15, 2026. Requirements compared against `docs/DAILYPROOF_V1_SPEC.md`, including its current-state overrides. Work continued through all phases under the user's explicit instruction to complete them.

## Implementation status

| Phase | Result |
| --- | --- |
| 0 | Preserved compact mobile metric hierarchy and default Grid/optional List with localStorage preference. |
| 1 | One tasks table, owner RLS, CRUD, complete/reopen, due/scheduled times and timezone buckets. |
| 2 | FullCalendar month/week/day, fixed commitments, tasks and recurring timed habits; deliberate phone week scrolling. |
| 3 | Notes, links and private image/screenshot proof; completed target ownership, signed reads and explicit sharing. |
| 4 | Manual reminders, history/settings, conditional delivery, nudges and friend activity; server cron and OneSignal adapter. |
| 5 | Server-side Gemini reads and reviewed execution plans, shared manual/AI writes, scheduling checks and proof assessment. |
| 6 | Daily scheduled/due task integration, friend history/privacy, desktop and phone navigation. |
| 7 | Security hardening, reproducible UI checks, environment example, manifest/icons, setup and deployment documentation. |

Local implementation is complete. This is **not a claim that remote deployment or external delivery is operational**. The new migrations and provider configuration still require the release checks below.

The existing checkpoint observed during final work was `d8e298c` (`phase up to 6 are done 7 remaining`). No reset, deployment, or remote migration application was performed.

## Validation results

- TypeScript: passed, `tsc --noEmit --incremental false`.
- Tests: **31 passed, 0 failed**, `node --test tests/*.test.mjs`.
- Full-repository ESLint: passed with **0 errors, 1 existing warning** in `postcss.config.mjs` (`import/no-anonymous-default-export`). No unrelated configuration refactor was made.
- Production build: passed with Next.js 16.2.10; application routes, cron route and manifest generated.
- Dependency audit: **0 known vulnerabilities** at the time checked.
- Browser component checks: **20 route/viewport combinations**, Dashboard/To-Dos/Calendar/Notifications/Assistant at **375, 390, 430 and 1280 px**. Checked document overflow, five mobile navigation targets, task create/complete, proof note/image controls, month/week/day switching, commitment creation, reminder form targets, and reviewed AI plan application. Screenshots were generated and representative mobile Dashboard/Calendar layouts inspected.

Browser checks use actual React components with synthetic local server-action fixtures. They do not exercise Next server-action transport, actual authentication, provider requests, or real Storage uploads. PGlite tests execute SQL against a reconstructed pre-existing schema and simplified auth/Storage fixtures; hosted Supabase remains a separate verification step.

Focused security assertions cover default Supabase grants, cross-owner task/proof denial, summary-only defaults, proof-sharing opt-in/revocation, anonymous RPC rejection, protected notification fields and push aliases, worker-only delivery RPCs, delivery leases/retries, exhausted-worker reminder state, atomic AI rollback/replay, stale reviewed edits, recurring-habit scheduling conflicts, and 4/5 daily completion.

## Architecture and security decisions

- Keep the existing stack and server-action architecture. FullCalendar supplies calendar rendering.
- One task record powers To-Dos, Calendar, Dashboard and AI; commitments do not count toward progress.
- Preserve existing habit-based streak semantics, including neutral unscheduled days, rest and vacation.
- Persisted owner timezone defines day boundaries; no second browser/server day system.
- Default friend summaries omit names/descriptions/proof. Proof visibility requires both profile-level opt-ins and per-proof permission; RLS enforces it.
- Notification service credentials stay server-only. Browser subscriptions use private random aliases and generic push previews.
- Persist notification delivery before sending, serialize claims, retry with stable idempotency keys, and record terminal failures.
- AI cannot issue arbitrary SQL or move commitments. Its allowlisted operations reuse manual writes. Reviewed updates include record timestamps to reject stale overwrites, and plans expire after 20 minutes.
- Private images have short-lived signed URLs. Revocation blocks new reads; an already-issued URL may live for its remaining 60 seconds.

## Migrations

These extend the already-applied foundation; none reimplements it:

1. `20260914100000_tasks.sql`
2. `20260914110000_calendar.sql`
3. `20260914120000_proofs.sql`
4. `20260914130000_notifications.sql`
5. `20260914140000_ai_operations.sql`
6. `20260914150000_daily_integration.sql`
7. `20260914160000_v1_hardening.sql`

They were validated locally, not applied to hosted Supabase. Review all seven in sequence before deployment. The repository lacks its original baseline migration; do not deploy the test fixture to fill that gap.

## Remaining configuration and limitations

1. Only the two public Supabase names were verified in `.env.local`; no values were exposed. Vercel environment names are unverified. [README environment table](../README.md#environment-variables) lists each missing name, source, environment and secrecy requirement.
2. Apply new migrations to the intended existing Supabase project and validate actual Auth/Storage policies there.
3. OneSignal and Gemini have not been configured. Real push receipt, provider identity/subscription behavior, image assessment, model responses and billing/quota remain unverified.
4. Vercel Hobby daily cron cannot meet minute-level reminders. Confirm a suitable Vercel plan or independently configure a scheduler for the existing authenticated endpoint. No purchase or alternative scheduler was provisioned.
5. Physical iPhone Home Screen push, Android push, Safari and Firefox are not covered by the Chromium fixture checks.
6. OneSignal web lacks the mobile identity-verification mechanism; the implemented private alias reduces exposure but is not a signed web identity protocol.
7. Manual ambiguous/nonexistent DST times are rejected. PostgreSQL resolves recurring habit/daily reminder wall times using its timezone rules; AI refuses to schedule around a recurring habit in an ambiguous transition window and asks for manual review.

No unapproved stack change or product phase was added. Provider and hosting constraints are reported rather than silently replacing the specified services.

## Exact manual release checks

Use two test accounts A and B plus an unrelated C. Use a staging environment backed by the intended migrated schema before production.

1. **Setup:** review migration history and dry run; apply the seven new migrations. Verify private `proofs` bucket and RLS. Set variables from README, redeploy and confirm the cron route rejects a request without its bearer secret (HTTP 401).
2. **Authentication:** sign in/out on desktop and a 375px phone. Confirm protected routes redirect when signed out. Refresh signed-in routes and verify the saved timezone persists.
3. **Dashboard:** check 375/390/430px and desktop. Start without a saved view preference: Grid is default; switch List, reload and verify persistence. Use all five status states, historical date/month controls, filters and habit editing. Scroll to the last row and verify bottom navigation does not hide it.
4. **Days and streaks:** in A's persisted timezone, complete a Monday habit, leave Tuesday unscheduled, complete Wednesday and confirm a two-day streak. Test a scheduled-but-empty Tuesday separately. Verify existing rest/vacation rules and midnight rollover without reloading.
5. **Tasks:** create/edit/delete a task, complete and reopen it; set due today, tomorrow, later this week and no due date. Verify each bucket against the saved timezone. Enter a DST gap/repeated time and confirm saving is blocked, without silently retaining an earlier value.
6. **Daily percentage:** arrange five eligible due/scheduled activities today with four complete. Confirm 80% on Dashboard and B's summary of A. A habit not scheduled today and a fixed commitment must not lower that percentage. Cancelled tasks are excluded.
7. **Calendar:** switch Month/Week/Day, Today and previous/next. Create/edit/delete a fixed commitment. Schedule a task and verify it is the same task visible in To-Dos. Set a recurring habit time and verify its weekdays. Attempt overlapping work and invalid start/end ranges; confirm rejection. Check phone week scrolling and event targets.
8. **Proof:** complete a task/habit; submit a note, HTTP(S) link and PNG/JPEG/WebP image. Read and remove each. Reject an oversized/unsupported file. Inspect private bucket access signed out and as C: denied. Reopen an activity and confirm new proof requires completion.
9. **Friend authorization:** A requests B. Attempt direct accepted insert, spoofed requester and identity-changing update through the authenticated API: denied. A cannot accept its own request; B can accept/decline. Verify existing feed/realtime activity still works.
10. **Privacy:** B opens A's recent history with defaults: summary only. Check network responses, not just UI, for absence of names/descriptions/proof. Enable detailed activity only: names may appear, proof remains private. Enable proof sharing plus individual friends visibility: only authorized proof appears. Revoke either option/remove friendship: new requests denied; allow issued image URLs up to 60 seconds to expire.
11. **Reminder delivery:** enable push on a real device; create a reminder two minutes ahead and close the browser. Confirm one push, correct click-through and one history row. Trigger the worker twice and verify no duplicate. Edit/cancel another pending reminder and verify its behavior. Complete a linked conditional reminder's activity before its due time and verify it is skipped.
12. **Failures/settings:** temporarily use invalid OneSignal configuration in staging; confirm failure history and retained pending retries. Restore credentials and verify retry. Disable push/friend activity/nudges and check preferences are respected. Send A→B nudge; verify history and delivery, and reject a second nudge within an hour. C cannot nudge B.
13. **AI:** configure a supported Gemini model. Test all four starters, task creation/update/scheduling/rescheduling, reminder creation/update/cancellation, and weekly summary. Review each proposal before applying. Verify fixed commitments stay unchanged and invalid overlap/due/duration is rejected. Edit a task after generating a plan; stale approval must fail atomically. Apply a plan twice: second attempt rejected. Discard a plan: no writes.
14. **AI proof/failure:** assess a selected owned image/note and verify classification, confidence and reason with the advisory wording. Attempt another account's proof ID: denied. Remove Gemini credentials in staging: manual tasks/calendar/proof/reminders remain usable.
15. **Release observation:** verify actual cron executions, push subscription state, application history and provider logs. Repeat key flows on installed iPhone and Android, and desktop browsers. Do not mark external delivery operational until these checks pass.

## Files

The accompanying [file inventory](V1_FILES.md) lists V1 implementation paths since the Phase 0 checkpoint. It excludes user-owned specification/instruction edits.
