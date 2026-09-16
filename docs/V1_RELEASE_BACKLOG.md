# DailyProof V1 Release Backlog

Created: 2026-09-15  
Baseline inspected: `780f634` (`added another gemini llm`)

This document is the **single V1 completion tracker**. Track remaining work and release evidence here. The [V1 product specification](DAILYPROOF_V1_SPEC.md), including its current-state overrides, remains authoritative for product requirements. The older validation report is historical evidence, not a second active completion checklist.

Creating this tracker does not authorize implementation or deployment. No application changes are part of this documentation task. P3 is explicitly deferred: **do not implement it yet**.

## Sources inspected and reconciliation

- [Existing release audit/checklist](V1_VALIDATION.md): implementation claims, local validation limits, configuration limitations, seven V1 migrations and all 15 manual release checks.
- [V1 file inventory](V1_FILES.md) and [README](../README.md): affected components, configuration, deployment and provider requirements.
- Completed visual-stability audit in this conversation: all findings **1–25**, preserved below as **VS-01–VS-25**, each appearing exactly once as a work item. There is no separate visual-audit file in the inspected repository.
- User-specified outstanding release blockers: notification enqueue SQL, AI habit-state context, atomic final-schedule rescheduling and production Gemini fallback.
- Current source/history: fallback exists in `780f634`; commit `d814902` records the move to Supabase cron and `vercel.json` is absent. Older README/release-audit instructions still refer to Vercel cron. R-05 owns reconciliation with actual hosted state; this inspection did not verify hosted configuration or deployment.

Earlier statements that local implementation is complete do not close the issues below. Historical tests and fixture browser checks do not establish real Auth/Storage, provider transport, physical-device delivery or current production readiness. The previously reported fallback validation (18 focused tests, typecheck, lint with one existing warning, and build) supports **CODE COMPLETE** for R-04 only; deployment and production testing remain open.

## Status and completion rules

Every item uses exactly one status:

| Status | Meaning |
| --- | --- |
| TODO | Work or verification remains and has not been started in this tracker. |
| IN PROGRESS | Active implementation or verification; record what remains. |
| CODE COMPLETE | Implementation and required local checks complete; applicable deployment/manual verification still pending. |
| DEPLOYED | Exact implementation/configuration/migrations are deployed to the intended environment; verification may remain. |
| MANUALLY VERIFIED | Required manual checks have evidence; confirm all other acceptance gates before closing. |
| DONE | Required tests passed and applicable deployment/production/manual checks passed, with evidence linked. Code existence alone is insufficient. |

For each status advancement, add an evidence note under the relevant issue ID: date, revision, environment, test commands/results, migration versions where applicable, verification results and remaining limitations. Record configuration **names**, never credentials, prompts, private application data or raw provider bodies. Mark a verification requirement not applicable only with an explicit reason.

QA-only items can proceed from TODO through IN PROGRESS and MANUALLY VERIFIED to DONE; they do not need an artificial CODE COMPLETE stage. No item is initially DONE.

## Ownership and deduplication

- R-01–R-05 own release correctness/configuration work. VS IDs preserve the visual audit's original numbering even where a functional risk places them in P0.
- VS-01 owns unknown settings/write gating; VS-02 owns list/choice loading; VS-03 owns drafts and refresh ordering. Implement coherently without creating three replacement state systems.
- VS-05 owns combined habit/task readiness; VS-17 owns legacy habit-only consumers; VS-18 owns shared habit state. VS-15 owns task refresh/mutation races.
- VS-07 owns Calendar loading; VS-08 owns internal navigation.
- VS-09 owns proof loading geometry; VS-10 owns request lifecycle; VS-13 owns friend-history integration.
- VS-20 owns initial feed-summary readiness; VS-21 owns leaderboard refresh presentation; VS-22 owns failed-read semantics.
- VS-11 is a small stability fix, not the P3 conversational redesign. UI-01–UI-06 should share one coherent redesign when separately started.
- FINAL QA rows are acceptance gates referencing these issues, **not duplicate implementation tickets**. Reuse evidence instead of creating duplicate fixes.
- Priority order is P0, P1, then confirmed P2 work. Execute relevant QA during each fix and repeat the complete release matrix on the final candidate. P3 remains deferred until explicitly started.

## P0 — Release correctness / functional blockers

| Issue number | Component | Problem | Smallest intended fix | Tests required | Production verification required | Status |
| --- | --- | --- | --- | --- | --- | --- |
| R-01 | Notification enqueue SQL | Production enqueue fix is not yet captured as a reproducible additive migration plus regression test. | Add a new migration for the exact production SQL correction; preserve prior applied migrations, grants, ownership and worker restrictions. Reconcile the hosted function with repository SQL. | Execute the migration on the pre-fix schema; reproduce the original failure and verify enqueue, conditional skip, deduplication and worker-only access. | Verify migration history and function definition on hosted Supabase; enqueue real due reminders and confirm one history/delivery record. | CODE COMPLETE |
| R-02 | AI today/week context; lib/ai-tools.ts | Today/week planning must distinguish completed, rest and vacation habit state from pending work. | Include authorized date-specific habit logs/statuses in planning context; reuse persisted timezone and established neutral-day/domain semantics. | Today and week fixtures for complete/missed/empty/rest/vacation/unscheduled days, timezone midnight and DST; context failure must not become empty work. | Ask today/week questions against known habit fixtures; verify completed work is recognized and rest/vacation is not treated as unfinished work. | CODE COMPLETE |
| R-03 | Coordinated task rescheduling; apply_work_actions | Valid multi-task moves can be rejected against intermediate schedules; final proposed state must be validated and committed atomically. | Validate the complete proposed schedule against unchanged tasks, commitments and recurring habits, then commit all changes atomically using an additive migration where needed; retain ownership, stale-plan, expiry and replay checks. | Valid swaps and chains in different action orders; final conflicts, concurrent edits, cross-owner actions, due/duration errors; all-or-nothing rollback and replay rejection. | Apply reviewed multi-task moves on the hosted schema; verify final calendar and task records, and no partial changes on rejection. | CODE COMPLETE |
| R-04 | Gemini fallback; lib/gemini.ts and server environment | Fallback code exists but configuration, deployment and real production behavior are unverified. | Configure distinct available GEMINI_MODEL and GEMINI_FALLBACK_MODEL with image/JSON support; deploy the tested implementation. No hardcoded model. | Re-run primary success/retry/exhaustion, timeout/body timeout, fallback retry, both-fail, non-transient rejection, JSON/image preservation, safe correlated diagnostics and 25-second overall budget tests. | Confirm deployed revision and configuration names without exposing secrets; verify real primary and fallback responses. Exercise controlled transient/timeout failures through an isolated test path on the deployed environment, not by disrupting user traffic; confirm no fallback for normal 4xx. | CODE COMPLETE |
| R-05 | Release configuration, scheduler and runbook | Historical release evidence does not establish current hosted migration/provider readiness. README still references removed vercel.json/Vercel cron despite commit d814902 switching to Supabase cron. | Inventory current hosted state, configure missing server/provider/origin/Auth settings, verify the intended Supabase cron job and authenticated worker endpoint, and reconcile stale runbook instructions. R-04 owns Gemini fallback; R-01 owns enqueue SQL. | Worker rejects missing/wrong bearer secret; provider failures/retries and protected fields remain covered; compare required migration/environment names with deployment inventory. | Record deployment revision, hosted migration list, cron cadence/execution, OneSignal origin/subscription, Auth redirects, private Storage and required environment names. Never record secret values. | CODE COMPLETE |
| VS-01 | NotificationCenter settings — audit 1; high; V1 | Unknown settings render as false/true defaults and are immediately editable; early save/push enable can overwrite persisted preferences. | Use explicit unresolved/loaded/error settings state, retain form dimensions and block dependent writes until settings are known. | Delayed successful/failed reads; existing enabled settings; early save/enable push cannot write defaults. | Throttle Notifications and confirm no false defaults or premature writes. | CODE COMPLETE |
| VS-03 | NotificationCenter refresh/drafts — audit 3; high; V1 | Initial load, polling and every mutation reload four datasets; keyed forms remount and older responses can overwrite new settings or drafts. | Separate drafts from server snapshots, order responses, refresh affected data only and load reminder choices on demand. | Dirty form plus poll, overlapping reads, save-versus-refresh ordering and request counts. | Edit during slow refresh and save; confirm no lost draft, reset or state rollback. | CODE COMPLETE |
| VS-04 | PrivacySettings proof sharing — audit 4; high; V1 | Proof sharing appears disabled before loading; errors are swallowed and a late read can replace the latest visual state. | Use unresolved/enabled/disabled/error state, stable checkbox row and initial-read gating; show errors. | Delayed enabled value, failed read, early click, save/initial-read race. | Verify enabled/disabled persisted values and failed-read behavior with two accounts. | CODE COMPLETE |
| VS-08 | Calendar event navigation — audit 8; high; V1 | Task/habit event URLs become native anchors and rebuild the document, repeating startup. | Route unmodified same-tab internal event clicks through Next navigation; retain modified/new-tab clicks and commitment editing. | Task/habit navigation does not reload the document; shell persists; Ctrl/Cmd/middle-click and commitment clicks still work. | Navigate from real Calendar events on phone and desktop; check shell continuity and destination state. | CODE COMPLETE |
| VS-22 | Habit/friend/feed/leaderboard reads — audit 22; high; mostly legacy, foundation affected | Ignored read errors become empty arrays or zero streaks; summary failures clear known cards. | Expose errors instead of fabricated successful empty/zero data; preserve safe known state for transient failures and clear private state on lost authorization/consent. | Fail each read/RPC; distinguish initial error from true empty and revalidation failure; test consent/auth revocation. | Controlled failed reads retain safe content or show error, never false zero/empty; revoked data disappears. | CODE COMPLETE |

## P1 — V1 visual stability

| Issue number | Component | Problem | Smallest intended fix | Tests required | Production verification required | Status |
| --- | --- | --- | --- | --- | --- | --- |
| VS-02 | NotificationCenter history/reminder choices — audit 2; medium; V1 | No notifications yet flashes before loading; task/habit selectors initially imply no linked choices. | Separate loading from successfully empty data; reserve list space and gate unresolved dependent choices. Coordinate with VS-01/VS-03. | Delayed and empty history/reminder choices; partial read failures; selectors cannot imply no data during loading. | Throttle populated and empty accounts and open Add reminder before options resolve. | CODE COMPLETE |
| VS-05 | Dashboard task integration/useTasks — audit 5; high; V1 affects legacy stats | Zero, habit-only and combined totals appear in succession; today's tasks initially look empty. | Expose task readiness/error; gate combined metrics on both inputs and preserve numeric/task footprints plus known values on refresh. | Resolve habits/tasks in both orders; empty/error cases; 4-of-5 total; background refresh retains values. | Compare settled Dashboard totals with known data and friend summary under throttling. | CODE COMPLETE |
| VS-06 | TaskBoard — audit 6; medium; V1 | Bucket headings bunch together then separate when cards arrive; one loading line has no list footprint. | Use card-shaped placeholders within existing buckets; keep valid known rows during refresh. Preserve the existing legitimate empty-state guard. | Populated/empty/error initial loads; mutation refresh; mobile layout snapshots. | Cold/repeat To-Dos navigation under slow network at target widths. | CODE COMPLETE |
| VS-07 | CalendarBoard loading — audit 7; medium; V1 | Empty-looking calendar precedes events; commitment/habit sections expand later despite a fixed calendar height. | Keep the 600px calendar frame, label/cover unknown contents as loading and reserve supporting-list space; retain known events while refreshing. | Delayed calendar data, true empty and errors; view controls; refresh does not blank events. | Observe Day/Week/Month first load and refresh on mobile/desktop. | CODE COMPLETE |
| VS-09 | ProofPanel loading — audit 9; medium; V1 | Existing proofs and assessment buttons arrive after the form, pushing it down. | Separate first load from mutations; reserve proof/assessment regions and stabilize the form position. | Open with populated/empty/failed proof reads; delayed assessment controls; layout assertions. | Open task and habit proofs on slow connections and verify stable form position. | CODE COMPLETE |
| VS-10 | ProofPanel request lifecycle — audit 10; medium; V1 | Image opening, assessment and repeated panel opening refetch lists; overlapping requests can apply stale results. | Refetch for list-changing operations or deliberate revalidation only; order requests and retain safe known owner data. | Request counts for image/assessment; open-close-open races; add/delete followed by older read; authorization failure. | Repeat proof operations and verify stable list, current results and authorized signed reads. | CODE COMPLETE |
| VS-11 | AssistantPanel response loading — audit 11; medium; V1 | New requests clear prior results immediately, contracting and later expanding the page. | Preserve response-region height or clearly retain previous content with disabled actions; show stable working feedback. Do not implement P3 chat redesign here. | Second request after long response, failure and timeout; old plan cannot apply as current; stable region while busy. | Repeat slow assistant requests and verify loading/error transitions without large collapse. | CODE COMPLETE |
| VS-12 | Mobile habit Grid — audit 12; medium; V1 mobile | Grid renders headers/loading text then expands into rows; List already has substantial skeletons. | Add grid-row skeletons using existing widths/sticky identity column; leave List design intact. | Grid at 375/390/430px; long names, delayed/empty habits, selected-date scrolling and view persistence. | Cold Grid loading and Grid/List switching on phone; no hidden last row. | CODE COMPLETE |
| VS-13 | FriendHistory/proof integration — audit 13; medium; V1 on legacy page | Friend summaries arrive separately and shift rows; history expansion has no pending state and duplicate clicks can refetch today/history. | Reserve summary line, show expansion loading, prevent duplicate requests and reuse the newly authorized today result within the request. | Many friends resolve out of order; repeated expand clicks; seven-day request counts; proof consent revocation. | Two-account history/proof expansion under throttling; unrelated account denied. | CODE COMPLETE |
| VS-14 | Push SDK initialization/logout — audit 14; medium; V1 | Logout can wait on otherwise-unused push initialization; failed SDK retries leave script/deferred callback duplication risks. | Show logout progress, avoid unnecessary initialization where safe and make failed initialization retries clean or reuse resources; preserve identity cleanup. | SDK success deduplication, timeout then retry, script failure, no previous push use, opted-in logout and account switch. | Real-device enable/retry/logout/login with different account; no cross-account delivery or unresponsive logout. | CODE COMPLETE |
| VS-15 | useTasks refresh ordering — audit 15; medium; V1 | Older focus/poll responses can visually undo a newer completion. | Deduplicate refreshes and reject results predating mutations; retain successful updates while revalidating. | Focus plus interval overlap, completion/reopen during delayed refresh, failures and unmount. | Complete/reopen while background refresh is slow; state must not revert. | CODE COMPLETE |

## P2 — Shared + legacy stability

| Issue number | Component | Problem | Smallest intended fix | Tests required | Production verification required | Status |
| --- | --- | --- | --- | --- | --- | --- |
| VS-16 | UserClockProvider/root startup — audit 16; medium; foundation affecting V1 | One-line startup becomes the whole shell and then page loading; root preference gating creates staggered entry. | Reserve shell/content footprint while keeping timezone-dependent content gated; consider narrowly seeding authenticated preferences from server. | Cold authenticated/anonymous entry, failed preferences, account switch, persisted timezone and hydration. | Cold load/refresh landing, auth and protected routes; verify no wrong-zone intermediate content. | TODO |
| VS-17 | Dashboard/Feed/Year/landing habit metrics — audit 17; medium; legacy affected by V1 | Habit-derived metrics show zero and charts show empty history before reads complete. | Honor existing habit loading state with stable number/chart placeholders; distinguish anonymous preview. VS-05 owns combined task readiness. | Delayed habits across all four consumers; true zero versus loading/error; chart geometry. | Compare populated/empty account metrics across routes under slow reads. | TODO |
| VS-18 | AppShell and habit consumers — audit 18; medium; legacy | Independent full-history fetches finish separately and can leave shell/page streaks disagreeing after mutations. | Share a user/session-scoped habit snapshot and mutation updates narrowly; avoid broad architecture changes. | Fetch deduplication, navigation reuse, mutation/rollback propagation, account isolation and logout clearing. | Change habits/logs and navigate Dashboard/Feed/Year; shell streak stays consistent. | TODO |
| VS-19 | Friends circle — audit 19; medium; legacy | Nested circleIsEmpty renders No friends here yet while friendships are unknown; incoming requests insert above it. | Gate both empty branches on readiness and reserve list/request space. | Delayed accepted/incoming/outgoing data, true empty and error cases. | Populated and empty friend accounts under throttled first/repeat navigation. | TODO |
| VS-20 | Feed/useDailySummaries — audit 20; medium; legacy/foundation affected | Summary hook resolves empty events before feed events arrive, allowing a false empty timeline between requests. | Gate first summary completion on feed readiness; separate initial loading from background refresh. | Delayed events then delayed summaries; no events; milestone-only feed; minute/realtime refresh. | Observe first Feed load and real friend check-ins; no false Nothing here yet flash. | TODO |
| VS-21 | Feed leaderboard — audit 21; medium; legacy, foundation minute refresh | Every refresh hides known rankings behind Loading; minute/event/self-streak changes cause repeated collapse. | Keep known rows while refreshing; reserve first-load rows; avoid friend refetch solely for local self-streak changes. | Minute/event/self updates, failure, ranking changes and request count assertions. | Leave Feed open across minute boundaries and friend activity; rankings remain visible. | TODO |
| VS-23 | Profile route — audit 23; low; existing/foundation affected | Slow sequential server reads delay navigation without route-specific feedback. | Add profile-shaped loading boundary and parallelize independent authenticated reads; retain server rendering. | Slow profile/summary/count reads, auth redirect, unavailable markers and route transition. | Slow desktop/mobile navigation to Profile with shell continuity. | TODO |
| VS-24 | Feed activity expansion — audit 24; low; legacy | One loading line becomes seven cards and shifts following content. | Reserve compact day-row skeletons in expanded region; retain fresh authorization each open. | Delayed/error/summary-only/detailed histories and repeated open after consent revocation. | Expand on mobile/desktop and revoke sharing between opens. | TODO |
| VS-25 | Friend search and signup availability — audit 25; medium; legacy | Failed search can display stale/current-looking results or no matches; failed username lookup can claim available. | Add read-error outcomes; associate results with resolved query; never infer availability from failed reads. | Lookup failure, query races, clearing/changing query, no matches, taken/available and recovery. | Controlled lookup failures never claim available/no matches or show old results as current. | TODO |

## P3 — UI/interaction redesign

All items below are planning-only and TODO. Do not implement this section yet. Any new aesthetic finding must be recorded here before work; do not refactor stable legacy screens merely for consistency.

| Issue number | Component | Problem | Smallest intended fix | Tests required | Production verification required | Status |
| --- | --- | --- | --- | --- | --- | --- |
| UI-01 | DailyProof Assistant conversational UI | Assistant interaction redesign is deferred. | Design and implement a conversational presentation only when P3 is explicitly started; preserve existing tools and review safety. | Conversation interaction/accessibility checks; no tool authorization regression. | Review phone/desktop conversation flows against approved design. | TODO |
| UI-02 | Persistent bounded active conversation | Active conversation continuity and explicit bounds need a product/implementation decision. | Define bounded history, persistence duration, reset behavior and per-user isolation; keep model context bounded. | Reload/navigation continuity, trimming limits, reset, logout/account isolation and prompt-context bounds. | Verify active conversation survives intended transitions and cannot cross accounts. | TODO |
| UI-03 | Composer and message history | Composer and results need separate interaction regions in P3. | Separate composer from message history with stable focus/scroll behavior; coordinate with UI-01. | Keyboard, long history, focus, scroll and mobile viewport changes. | Real-device keyboard/composer/history interaction. | TODO |
| UI-04 | Explicit Apply/Edit/Cancel plan controls | Reviewed plans need clear lifecycle controls in the redesigned UI. | Define and implement explicit controls; edits require renewed validation/review and cancellation must not apply writes. | Apply/edit/cancel, stale/expired/replayed plans, pending requests and ownership. | Confirm reviewed values match committed changes and cancelled plans write nothing. | TODO |
| UI-05 | Markdown rendering | Assistant response formatting needs readable Markdown. | Add safe Markdown rendering within the existing design; disable unsafe raw HTML and unsafe link schemes. | Lists/code/links, malformed Markdown, injection attempts, long content and overflow. | Verify real responses on mobile/desktop without unsafe rendering. | TODO |
| UI-06 | Compact quick-action UI | Starter controls need a compact redesign. | Design compact accessible starters without moving business logic into UI. | Keyboard/touch targets, disabled states and composer interaction. | Verify target widths and real starter flows. | TODO |
| UI-07 | Final visual/aesthetic cleanup | Additional cosmetic issues may be discovered during final review. | Record concrete review findings here before changing them; keep existing identity and avoid speculative legacy refactors. | Targeted visual/accessibility checks for approved changes. | Review resulting screens at all target widths. | TODO |

## FINAL QA

| Issue number | Component | Problem | Smallest intended fix | Tests required | Production verification required | Status |
| --- | --- | --- | --- | --- | --- | --- |
| QA-01 | ~375px mobile | Release candidate needs complete narrow-phone review. | Verify all core routes, long content, forms, bottom navigation, scrolling, Grid/List and loading/error states. | Responsive browser checks and screenshots at approximately 375px. | Run signed-in core flows on deployed candidate. | TODO |
| QA-02 | 390px mobile | Release candidate needs 390px coverage. | Repeat core layout/interaction checks at 390px. | Responsive suite at 390px. | Verify real-device or matching viewport behavior. | TODO |
| QA-03 | 430px mobile | Release candidate needs wide-phone coverage. | Repeat core layout/interaction checks at 430px. | Responsive suite at 430px. | Verify deployed candidate at matching viewport. | TODO |
| QA-04 | Desktop and browser coverage | Fixture Chromium checks do not establish browser compatibility. | Check desktop, Safari, Firefox and Android Chrome/push as applicable; preserve layouts and navigation. | Desktop responsive and available cross-browser automation. | Real browsers/devices: forms, Calendar, proof and push; record versions. | TODO |
| QA-05 | Slow network | Cold/refresh transitions must not expose invented state or jump excessively. | Throttle each initial/dependent read and record visual transitions; covers VS items without creating duplicate fixes. | Delayed-response tests, layout/scroll measurements and screenshots. | Verify real deployed transport under throttling. | TODO |
| QA-06 | Failed reads | Failure must be distinct from empty/zero/disabled. | Exercise initial and background failures, recovery, authorization loss and partial failures. | Fault-injected read/RPC tests. | Use controlled test accounts/environment failure paths; verify clear errors and safe retained state. | TODO |
| QA-07 | Repeat navigation | State reuse and transitions need release verification. | Navigate repeatedly among all routes and Calendar event destinations; check request counts and shell persistence. | Navigation/refresh/reload tests and document-reload detection. | Repeat on deployed mobile/desktop; no stale cross-user state. | TODO |
| QA-08 | Background refresh | Polling/realtime/focus refresh must preserve known UI. | Leave screens open across minute ticks and realtime updates; focus/visibility changes. | Refresh-order, deduplication and dirty-form tests. | Observe real realtime/poll updates with two accounts. | TODO |
| QA-09 | In-flight mutations | Concurrent reads/writes must not lose edits or roll back current UI. | Exercise save/complete/delete/approval during slow refresh and repeated interaction. | Race, rollback, pending-control and stale-response tests. | Verify resulting database state and UI after controlled overlaps. | TODO |
| QA-10 | iPhone Home Screen PWA | Installed-app and physical push remain external verification gates. | Install from production origin; verify icons/manifest, keyboard, safe areas, auth and service worker behavior. | Manifest/service-worker checks and mobile layout suite. | Physical iPhone: enable push, close app, receive/open push, logout/account change. | TODO |
| QA-11 | Two-user privacy/friend flow | Existing security behavior must survive stability changes. | Use A/B plus unrelated C; requests/accept/decline/remove, summaries, details/proof opt-in and revocation; inspect network payloads. | RLS/ownership, spoofed insert/update, self-accept denial and realtime regressions. | Run hosted A/B/C flow; no private names/descriptions/proofs in default responses; expired signed URL checks. | TODO |
| QA-12 | Proof lifecycle | Real Storage/provider paths are not covered by fixture UI checks. | Complete activity; create/read/remove note/link/image; reject invalid files and incomplete targets; verify sharing and revocation. | Proof ownership, type/size, signed upload/read, cleanup and reopening tests. | Real PNG/JPEG/WebP uploads, failed upload cleanup, signed reads and two-user sharing. | TODO |
| QA-13 | Reminders/push | Delivery, scheduler and preference behavior need end-to-end evidence. | Exercise create/edit/cancel, conditional skip, daily reminders, friend activity/nudges, preferences, retries and duplicate worker invocation. | Notification enqueue/leases/idempotency/backoff/exhaustion, nudge cooldown/authorization and settings tests. | Real closed-browser delivery/click-through and history; provider failure/recovery; disabled preferences; verify cron logs. Evidence for R-01/R-05. | TODO |
| QA-14 | AI create/update/schedule/reschedule/reminder/proof actions | Every allowlisted assistant flow must work against real data. | Exercise starters and today/week context, task CRUD/planning, reminder create/update/cancel/list and owned note/image assessment; review before application. | Context-state fixtures; final-schedule atomicity; fixed blocks/habits, due/duration, stale/expired/replay/ownership rejection and rollback. | Real model plus hosted data; verify exact persisted changes, advisory proof output and rejected cross-owner proof. Evidence for R-02/R-03. | TODO |
| QA-15 | Gemini primary/fallback behavior | Implemented fallback needs release-level evidence. | Complete R-04's controlled primary/fallback matrix with configured available models. | Focused Gemini/diagnostics tests, JSON/image support and shared latency bound. | Verify deployed primary and fallback responses, safe failures and metadata-only correlation logs; record no prompts/secrets. | TODO |
| QA-16 | Manual functionality when AI unavailable | Provider failure must not block manual application features. | Exercise manual habits/tasks/calendar/proof/reminders while Gemini is unavailable. | AI-disabled/unavailable integration paths and safe errors. | Controlled provider outage/test configuration; confirm manual operations persist correctly. | TODO |
| QA-17 | Tests/typecheck/lint/build | Historical passing checks do not validate the final candidate. | Run focused and full tests, typecheck, lint, production build, UI checks and dependency audit; record failures/warnings and resolutions. | npm test; npm run typecheck; npm run lint; npm run build; npm run test:ui; npm audit. | Record exact release revision/artifact; deployed smoke check in QA-21. Existing warnings are not silently counted as resolved. | TODO |
| QA-18 | Hosted migration verification | Local SQL fixtures are not proof of hosted schema/RLS correctness. | Compare actual migration history and definitions with repository, including R-01/R-03 additions; use normal backup/review/apply process without replaying foundation. | Migration upgrade/regression tests, RLS/grants, worker access, functions/indexes and private Storage policies. | Record hosted migration versions and policy/function verification; never deploy test fixture as missing baseline. | TODO |
| QA-19 | Authentication/session/timezone | Auth and canonical timezone must remain stable. | Verify sign-in/out, protected redirects, refresh/session changes, saved timezone and startup errors. | Auth boundaries, per-user cache clearing, midnight rollover and DST fixtures. | Desktop/phone login/logout plus timezone persistence and rollover. | TODO |
| QA-20 | Habits/tasks/calendar/daily progress | Release audit's domain/manual controls remain required. | Check all habit states, scheduled/unscheduled days, filters/history/CRUD, task buckets/CRUD/complete/reopen, calendar views/commitments/habit times and shared task identity. | Streak neutrality, DST gap/repeat rejection, overlap/due/duration guards, cancelled exclusion and 4-of-5 = 80% integration. | Verify real persisted timezone, Dashboard and friend summary agreement; fixed commitments/unscheduled habits do not reduce progress. | TODO |
| QA-21 | Release observation and evidence sign-off | Deployment alone does not establish V1 completion. | Collect revision, dated test evidence, hosted checks, actual cron/function/provider observations and remaining constraints; reconcile documentation with deployed setup. | Review every tracker item's acceptance evidence and unresolved dependency. | Run deployed smoke flows; verify worker unauthorized 401, service-worker/origin/Auth configuration and observed delivery before sign-off. | TODO |

## Preserve / no speculative work

These audit observations are constraints, not additional open issues:

- Preserve normal Next Link navigation and the persistent shell; VS-08 targets Calendar's native event links only.
- Supabase already reuses its browser client. Successful OneSignal initialization already shares a promise; VS-14 targets failure/retry and logout behavior.
- Preserve server-loaded Profile summary values and unavailable markers, and the preference-gated detailed-activity setting.
- Preserve To-Dos' existing legitimate-empty guard, desktop habit skeletons and mobile List skeletons.
- Preserve privacy-sensitive reauthorization on history/proof access. Cached private data must not survive consent or authorization loss.
- No hydration mismatch or saved mobile Grid-to-List flash was confirmed. Do not create a speculative fix; test these paths in QA.
- The one-second clock causes consumer rerenders, but flicker was not established. Profile before changing its architecture.
- Intentional user-driven expansion and real activity insertion are expected. Fix asynchronous intermediate jumps without redesigning established behavior.
- Keep the existing Next.js/Supabase stack, timezone rules, habit streak semantics and visual identity. Do not rebuild the foundation.

## Release-audit coverage and known constraints

| Historical release-audit area | Canonical tracker coverage |
| --- | --- |
| Environment setup, migrations, Auth/Storage policies, worker authentication | R-01, R-05, QA-18, QA-19, QA-21 |
| OneSignal/Gemini setup and real delivery/model verification | R-04, R-05, QA-13, QA-14, QA-15 |
| Minute scheduler and stale Vercel cron instructions | R-05, QA-13, QA-21 |
| Authentication, Dashboard, days/streaks, task buckets, daily percentage, Calendar | QA-01–QA-04, QA-19, QA-20 |
| Proof creation/upload/read/removal and sharing | QA-11, QA-12 |
| Friend authorization, privacy, revocation and realtime | QA-08, QA-11 |
| Reminders, failure/retry settings, nudges and delivery observation | R-01, R-05, QA-10, QA-13, QA-21 |
| AI tool coverage, reviewed plans, stale/replay safety, proof and provider failure | R-02, R-03, R-04, QA-14–QA-16 |
| Local tests, fixture limitations, production build and dependency audit | QA-17 plus hosted/device gates |
| Physical iPhone/Android and Safari/Firefox gaps | QA-04, QA-10, QA-13 |

Retain the release audit's explicit constraints: OneSignal web private aliases are not a signed mobile identity-verification protocol; revoked proof sharing blocks new reads but an issued signed URL may remain valid for up to 60 seconds; downloaded content cannot be recalled. Manual ambiguous/nonexistent DST times remain rejected, and recurring/AI DST behavior must be verified against existing semantics (QA-20/QA-14). Do not infer a hosting purchase, schema deployment or provider readiness from old documentation.

The original baseline migration is not established by the old release audit; verify actual migration history rather than deploying reconstructed test fixtures. Never reapply/rebuild the already-completed foundation merely to satisfy a checklist.

## Evidence log

### Remaining P0 correctness — 2026-09-16

Baseline `fa7d65c`; changes are in the working tree, not a committed or deployed revision. Read the entire backlog and product specification before implementation. Marked **R-04, R-05, VS-01, VS-03, VS-04, VS-08, VS-22** IN PROGRESS before coding. The user reports R-01/R-02/R-03 already implemented and production-tested; their code, migrations and existing tracker statuses were left unchanged. Older P0-A evidence below is historical, not a request to repeat that work.

After the automated checks below, **R-04, VS-01, VS-03, VS-04, VS-08 and VS-22 are CODE COMPLETE**. **R-05 remains IN PROGRESS:** local runbook corrections and worker regression tests are complete, but no connected Supabase/Vercel/OneSignal/Gemini administration interface is available to establish or change hosted state. No item was marked DEPLOYED, MANUALLY VERIFIED or DONE.

| ID | Root cause and permanent change | Remaining release gate |
| --- | --- | --- |
| R-04 | Existing fallback implementation was inspected and retained without rewriting. Revalidated selection, HTTP/timeout retries, non-transient rejection, identical JSON/image payloads, safe correlated diagnostics and the shared 25-second budget. `.env.example` and README now distinguish optional runtime compatibility from the required V1 fallback configuration. | Configure a nonempty, available image/JSON-capable `GEMINI_FALLBACK_MODEL` different from `GEMINI_MODEL` in Vercel Production and redeploy; verify actual primary/fallback traffic. The exact project-available model ID is unknown and was not guessed. |
| R-05 | Stale deployment instructions referenced a removed Vercel cron file. README now describes the existing Supabase Cron job calling the authenticated GET worker, with protected secret matching and HTTP-result verification. The old validation report is labeled historical. New worker tests cover missing/wrong/unconfigured bearer rejection, generic failure responses and retained retries/idempotency. | Hosted environment/migration inventory, actual cron cadence and authenticated HTTP result, Auth redirects, private Storage and OneSignal origin/subscription/delivery remain unverified. This operational work cannot be completed from local evidence. |
| VS-01 | Notification preferences used editable invented booleans before reading persisted settings. A nullable known snapshot and separate draft now gate dependent writes; initial errors have retry controls and reserved setting/control dimensions. | Throttled and failed settings reads on the deployed app; confirm no premature save/push write. |
| VS-03 | Polling and all mutations reloaded four datasets and keyed forms remounted. Settings now load independently and are not polled; controlled drafts survive polling, and device enable preserves unsaved unrelated edits. History/reminders refresh independently using request generations and mutation invalidation. Choices load on editor opening; controlled task/habit IDs preserve existing links. Pending writes gate editor changes. | Dirty edits across minute polling, slow overlapping reads/writes, failed save recovery and affected-only request counts. |
| VS-04 | Proof sharing started at false, swallowed errors and had an unguarded read. It now distinguishes unknown from either persisted boolean, reports/retries errors, gates writes until resolved and ignores obsolete initial reads. Failed writes retain the confirmed value. | Enabled/disabled accounts, delayed/failing reads, save failure, navigation and two-user persisted sharing/revocation. |
| VS-08 | FullCalendar event URLs used native document navigation. Only unmodified same-tab task/habit destinations are passed to Next router; modified/new-tab clicks and fixed-commitment editing retain their behavior. | Real Next shell continuity, browser history and phone taps on the deployed app. |
| VS-22 | Habit/friend/feed/profile-join/streak errors became successful empty/zero results, and summary failures erased known cards. Read errors are now explicit and consumers suppress false successful metrics/empty messages. Transient refresh failures retain safe known rows; successful ownership reads and authorization/consent revocation remove inaccessible data, including when another historical request fails. Request guards protect summary/friend results and local mutations; initial habit reads merge locally changed IDs without duplication. Existing auth-provider unmounting remains the session boundary. | Controlled failed reads, successful empty reads, recovery, partial failures, in-flight mutations and account/consent/friendship revocation on hosted data. |

Tests added (27 total):

- `tests/p0-client.test.mjs`: 23 actual React/browser regressions with synthetic deferred transport at 375px. Covers unknown/failed preferences, persisted true/false values, failed writes, dirty drafts, polling/request counts, selective refresh, linked-reminder choices, read-versus-write ordering, real FullCalendar clicks through a router fixture, each legacy read failure, successful emptiness, initial habit creation races, known streak/card retention, friendship removal races, privacy revocation and obsolete/unmounted responses.
- `tests/p0-release.test.mjs`: four navigation/worker regressions, including Ctrl/Cmd/Shift/Alt/middle/new-tab handling, internal destination allowlisting, worker bearer authentication and provider failure/retry with unchanged idempotency key and generic push contents.
- Existing Gemini, diagnostics, database privacy/RLS, notification protections and P0-A suites were rerun unchanged. Browser fixtures are not hosted Next/Auth/provider verification; PGlite fixtures are not hosted migration evidence.

| Final validation | Result |
| --- | --- |
| `node --test tests/p0-client.test.mjs tests/p0-release.test.mjs tests/gemini-retry.test.mjs tests/assistant-diagnostics.test.mjs tests/v1-security.test.mjs` | 48 passed; 0 failed |
| `node --test tests/*.test.mjs` | 108 passed; 0 failed |
| `npm.cmd run typecheck` | Passed |
| `npm.cmd run lint` | Passed: 0 errors; one pre-existing `postcss.config.mjs` anonymous-default-export warning |
| `node node_modules/next/dist/bin/next build` | Passed on final source; all routes generated. A rerun initially hit Windows EPERM on a generated `.next/static` reparse-point artifact; removing only that verified generated directory resolved it. |
| `node scripts/ui-build.cjs` then `node scripts/ui-check.cjs` | 20 route/viewport checks passed at 375, 390, 430 and 1280px |
| Final diff/spec/security review and `git diff --check` | Passed; no new migration, database/server-action authorization change, scheduling/reminder/AI guard change, or P1/P2/P3 implementation |

Exact files changed in this batch (25):

- `.env.example`
- `README.md`
- `app/(app)/dashboard/page.tsx`
- `app/(app)/feed/page.tsx`
- `app/(app)/friends/page.tsx`
- `app/(app)/year/page.tsx`
- `app/page.tsx`
- `components/calendar/calendar-board.tsx`
- `components/layout/app-shell.tsx`
- `components/notifications/notification-center.tsx`
- `components/profile/privacy-settings.tsx`
- `docs/P0_PRODUCTION_VERIFICATION.md` (new)
- `docs/V1_RELEASE_BACKLOG.md`
- `docs/V1_VALIDATION.md`
- `lib/calendar-navigation.ts` (new)
- `lib/hooks/use-daily-summaries.ts`
- `lib/hooks/use-feed-data.ts`
- `lib/hooks/use-friends-data.ts`
- `lib/hooks/use-habits-data.ts`
- `lib/hooks/use-leaderboard.ts`
- `lib/hooks/use-notification-settings.ts` (new)
- `lib/hooks/use-remote-data.ts` (new)
- `lib/read-errors.ts` (new)
- `tests/p0-client.test.mjs` (new)
- `tests/p0-release.test.mjs` (new)

Architecture/scope review: shared read-error classification and component-scoped ordered remote reads; notification draft logic separated from list reads. No shared habit cache, competing completion definition, client SDK replacement, delays, forced reloads, notification information-architecture change or assistant conversation redesign. Minimal consumer error guards are VS-22 correctness work; P1/P2 placeholders/loading polish remain deferred. No `.env.local` contents were inspected or exposed. The normal Next build loaded its environment automatically.

All changed client code still requires deployment. R-04 requires production model configuration plus deployment/provider tests. R-05 requires hosted administration access and evidence; no architectural workaround was introduced. The full configuration inventory and exact production/manual steps are in [P0_PRODUCTION_VERIFICATION.md](P0_PRODUCTION_VERIFICATION.md). This batch is stopped at P0.

No new tests, deployments, hosted inspection or production verification were performed while creating this document. Add dated issue-specific evidence here as work progresses. All TODO statuses are intentionally conservative; reconcile existing evidence before advancing them.


### P0-A core correctness ? 2026-09-16

Scope explicitly authorized after tracker creation: **R-01, R-02, R-03 only**. These three moved from TODO to IN PROGRESS before implementation and now to CODE COMPLETE after automated validation. No other item advanced. Nothing in this batch is DEPLOYED, MANUALLY VERIFIED or DONE.

Implementation is an uncommitted working-tree change on baseline `780f634`; record the eventual commit/deployment revision when applying it.

- **R-01:** added `supabase/migrations/20260915100000_enqueue_due_notifications.sql`. It replaces only `public.enqueue_due_notifications()`, separates PL/pgSQL variable names from SQL aliases and qualifies table references. Existing selection limits, locks, conditional-complete skip behavior, daily-time conversion, due-soon window, payloads, source keys, conflict handling and ACL/security mode are preserved from repository behavior. The regression reproduces the historical alias failure, applies the replacement, invokes it twice and proves stable notification IDs/counts plus unchanged conditional skips and worker-only access. **The actual corrected production function definition was not supplied or inspected; exact hosted equivalence remains a mandatory pre-application comparison, not a claim of production verification.**
- **R-02:** `lib/daily-progress.ts` is the shared source for daily/period eligible activity counts and completion. `lib/ai-context.ts` assembles explicit habit states and separate incomplete habit/task lists; `lib/ai-tools.ts` loads owner-scoped logs for today/week and includes tasks. Weekly completion weights eligible activity-days, not rounded daily percentages or logged-only habit completion. `lib/actions/assistant.ts` supplies these semantics to the first model request. No new persisted skipped habit state was invented: unscheduled days are explicitly neutral; rest/vacation are excluded from eligible completion. Existing manual daily percentage/streak behavior is retained.
- **R-03:** extracted the existing recurring-habit/free-slot logic into `lib/work-schedule.ts`, shared by read tools and final-proposal prechecks. Both proposal creation and approval now validate the complete proposed calendar. Added `supabase/migrations/20260915110000_coordinated_task_rescheduling.sql` replacing only `apply_work_actions(jsonb)`: under the existing owner scheduling lock, check/lock original task rows and stale timestamps, reject duplicate task targets, vacate changed intervals inside the transaction, and apply final actions through unchanged validation triggers. Any failure rolls back staging, all writes and plan application. Reminder stale checks retain their original per-action behavior. No authorization, trigger or constraint bypass was introduced.

Exact files changed in this batch:

- `docs/V1_RELEASE_BACKLOG.md` (pre-existing untracked tracker; only R-01?R-03 statuses and this evidence appended)
- `lib/actions/assistant.ts`
- `lib/ai-tools.ts`
- `lib/daily-progress.ts`
- `lib/ai-context.ts` (new)
- `lib/work-schedule.ts` (new)
- `supabase/migrations/20260915100000_enqueue_due_notifications.sql` (new)
- `supabase/migrations/20260915110000_coordinated_task_rescheduling.sql` (new)
- `tests/ai-context.test.mjs` (new)
- `tests/coordinated-scheduling.test.mjs` (new)
- `tests/notification-enqueue.test.mjs` (new)
- `tests/work-schedule.test.mjs` (new)
- `tests/p0-database.mjs` (new full-migration PostgreSQL fixture helper)
- `tests/database.test.mjs` (fix foundation fixture's historical migration cutoff; its previous date-prefix exclusion incorrectly selected later additive migrations before their prerequisites)

Automated evidence:

| Check | Result |
| --- | --- |
| Focused: `node --test tests/notification-enqueue.test.mjs tests/ai-context.test.mjs tests/work-schedule.test.mjs tests/coordinated-scheduling.test.mjs tests/daily-progress.test.mjs tests/ai.test.mjs` | 33 passed; 0 failed |
| Full suite: `node --test tests/*.test.mjs` | 81 passed; 0 failed |
| `npm.cmd run typecheck` | Passed |
| `npm.cmd run lint` | Passed: 0 errors; existing `postcss.config.mjs` anonymous-default-export warning remains |
| `node node_modules/next/dist/bin/next build` | Passed; all routes generated |
| Final scope/security/domain review and `git diff --check` | Passed; no historical migrations, UI, P1/P2/P3, Gemini fallback or unrelated application behavior changed |

New tests cover completed/incomplete/missed/rest/vacation/unscheduled habit context, cancellation, mixed task/habit 80% progress, weighted weekly totals, owner timezone/DST boundaries, failed reads and the actual first assistant model context. Scheduling tests cover the original failing 09:00/10:00 chain, swaps and reversed order, new tasks using vacated slots, final/unmoved/fixed/recurring overlaps, ownership, stale task and reminder checks, invalid ranges, rollback, expiry/replay, duplicate targets and direct/manual constraints. Existing full-suite RLS/privacy tests also pass. PGlite executes real SQL against the test reconstruction; it does not substitute for hosted concurrency verification or production provider checks.

#### Required hosted application and manual production verification (not performed)

1. **Preflight production equivalence:** inspect `select pg_get_functiondef('public.enqueue_due_notifications()'::regprocedure);` and its ACL/security configuration on the intended Supabase project. Compare with the additive enqueue migration. If differences extend beyond identifier qualification/formatting, reconcile them before application so the existing production repair is not overwritten with different behavior. Check actual migration history; do not rewrite/replay older migrations or deploy the test fixture.
2. **Apply and deploy:** after the normal database review/backup process, apply `20260915100000_enqueue_due_notifications.sql` followed by `20260915110000_coordinated_task_rescheduling.sql` through the migration workflow. Verify the function definitions, original security modes/EXECUTE grants and unchanged overlap triggers/RLS. Deploy the accompanying server/domain code using the existing deployment process. Record migration versions and deployed revision; neither step was executed here.
3. **Enqueue idempotency:** using dedicated test accounts, create an ordinary reminder due shortly, conditional reminders linked to completed task/habit targets, an enabled daily reminder already due in the owner's saved timezone and a pending task due in 10 minutes. Include a disabled-settings account and a future reminder. After the short reminder becomes due, invoke `enqueue_due_notifications()` twice through the authorized worker/admin path before any new due boundary. Filter notifications by the test account/source keys: one ordinary reminder row, one daily key and one due-task key; second invocation must leave IDs/counts unchanged. Conditional completed targets are skipped and future reminders remain pending. Confirm authenticated/anonymous direct execution is denied, then observe normal worker delivery without changing production scheduler behavior.
4. **Today/week context:** in the saved timezone, arrange three completed eligible habits, one completed due/scheduled task and one incomplete due/scheduled task (same-day due/schedule counts once): Dashboard and AI should both report 4/5 = 80%. Add rest/vacation habits and an unscheduled-day habit; percentage and unfinished recommendations must stay neutral for those. Ask ?What should I do next??, ?What is completed today?? and a weekly summary. Completed work must be recognized, only pending/empty/missed eligible work presented as unfinished, and weekly counts must agree with the sum of daily eligible activity counts. Complete/reopen an item and ask again. Use mixed completed/incomplete habit fixtures and verify the owner-day boundary, not UTC/browser day, is used.
5. **Coordinated schedule:** choose a future local day with free test slots. Create A 09:00?10:00 and B 10:00?11:00. Review and apply A ? 10:00?11:00 plus B ? 11:00?12:00; verify both final records and Calendar. Reset and repeat reversed proposal order, then a swap. Propose both at 11:00?12:00 and verify rejection with all original values/plan state unchanged. Repeat against a fixed commitment, an unchanged task and a timed recurring habit; these must remain protected. Test end <= start and AI due/duration restrictions.
6. **Stale/auth/atomic checks:** generate a reviewed plan, edit one target before applying, and confirm rejection without partial moves. Repeat with a stale reminder in a mixed plan. Account B must not modify account A's task IDs; signed-out calls must fail. Expired or reapplied plans must fail. Race an independent manual scheduling request with plan application and verify no committed overlap (serialization or safe rejection is acceptable). Recheck normal single-task/manual controls. Record evidence for these three items only; do not advance another P0 item.

### R-05 push content correction ? 2026-09-16

**Status: CODE COMPLETE.** Local push-content fix and validation complete in the working tree on revision `a63ffa5`. This supersedes the earlier IN PROGRESS status for local code completion only. Hosted configuration, deployment and manual verification gates listed above remain open; this is not DEPLOYED, MANUALLY VERIFIED or DONE.

`lib/push.ts` now includes the claimed notification's `title` and nullable `body` in `DeliveryRow`. OneSignal headings preserve the database title, with `DailyProof` as the blank/missing fallback. Ordinary notification bodies preserve database content; null, empty or whitespace-only bodies use the existing generic message. Nudges retain `A friend sent you a nudge.` No claim/enqueue SQL, scheduling, retry, authentication, idempotency, RLS or schema changes were made.

`tests/p0-release.test.mjs` adds seven payload regressions exercising the actual delivery worker with mocked transport: scheduled reminder title/body preservation, null/empty/whitespace body fallback, intended nudge message, and blank/missing content fallback. Existing bearer, failure and retry/idempotency checks remain covered.

| Check | Result |
| --- | --- |
| `node --test tests/p0-release.test.mjs` | 11 passed; 0 failed |
| `node --test tests/*.test.mjs` | 115 passed; 0 failed |
| `npm.cmd run typecheck` | Passed |
| `npm.cmd run lint` | Passed: 0 errors; one existing `postcss.config.mjs` anonymous-default-export warning |
| `node node_modules/next/dist/bin/next build` | Passed; all routes generated |

The sandbox initially blocked Node test-worker spawning with EPERM; tests passed when rerun with authorized execution. No live OneSignal delivery, hosted configuration changes or deployment was performed. Scope stops at this push-content fix.


### P1 visual/state stability - 2026-09-16

**VS-02, VS-05, VS-06, VS-07, VS-09, VS-10, VS-11, VS-12, VS-13, VS-14 and VS-15: CODE COMPLETE.** All unfinished P1 rows were marked IN PROGRESS before implementation and advanced only after the final automated checks passed. Baseline `3e097e4`; implementation is an uncommitted working-tree change. No deployment or hosted/manual verification was performed. Nothing advanced to DEPLOYED, MANUALLY VERIFIED or DONE. P0 implementation and P2/P3 statuses remain unchanged.

| ID | Root cause and final fix | Automated evidence |
| --- | --- | --- |
| VS-02 | Unknown history/reminder lists had no footprint; failed dependent choices still looked like pending choices. Reserve list/card space only while unknown, retain known rows, and provide unavailable/retry states for failed choices. Existing successful-empty guards and P0 draft/settings lifecycle remain intact. | Delayed history/reminder/choice reads, disabled unresolved selectors, failed-choice retry, genuine empty history; existing P0 preference/draft/partial-read tests pass. |
| VS-05 | Dashboard calculated totals before both inputs were ready. Gate integrated metrics on habit and task readiness; reserve numeric/task space, distinguish error/unknown from real zero and retain known task totals on refresh. | Both resolution orders, 4/5 = 80%, failed inputs versus real empty/zero, background refresh/failure with retained totals. |
| VS-06 | Task buckets initially contained headings without card space; independent page state refetched after each change. Add card placeholders only for unknown initial data and consume the shared task snapshot. Preserve existing row order on edits and retain rows during revalidation. | Initial populated/empty/error states, bucket dimensions, edit ordering, repeat navigation reuse, existing task CRUD/responsive checks. |
| VS-07 | Calendar looked empty while events were unknown and supporting sections expanded without reserved space. Keep the 600px frame, cover only unknown data, reserve commitment/habit-time cards, and reuse the existing ordered remote-data hook for mutation revalidation. | Frame dimensions, initial failure/retry/true empty, Day/Week/Month controls, retained events during delayed/failed revalidation; P0 client-event navigation tests still pass. |
| VS-09 | Proof list/assessment controls inserted above the form; one busy state mixed initial reads with writes. Keep the form before the saved-proof/assessment region, reserve that region, and track initial reads separately from mutations. | Form-position assertions before/after populated, failed and empty reads and assessment output; mobile screenshots inspected. |
| VS-10 | Image opening, assessment and panel reopening all refetched the list; old requests could overwrite later state. Keep an owner/target-scoped in-memory list, explicitly refresh when requested or after additions, apply successful deletions locally, invalidate older reads, and ignore unmounted/old-target results. Signed image reads and assessment remain server-authorized on each action; detected access loss clears retained content. | Request counts for opening/reopening/image/assessment, add/delete versus older reads, target changes, signed-image authorization failure, initial error recovery; existing database proof privacy tests pass. |
| VS-11 | Asking another question immediately cleared the previous response. Retain it with previous-response feedback and invalidate its Apply action until a new successful reply; keep actions disabled while busy. No conversational persistence or P3 controls were added. | Long prior response remains during another request and timeout/failure; response height retained, stale Apply disabled and no approval call made. |
| VS-12 | Mobile Grid only had a small loading line before full rows arrived. Render five placeholder rows using the existing 160px sticky identity column and 44px date columns; retain existing rows if already known. Mobile List and desktop row design are unchanged. | Pending Grid at 375/390/430px, Grid/List switching and persisted preference, genuine empty response; existing responsive checks cover long names, selected-date positioning and scrolling. |
| VS-13 | Friend summaries lacked reserved space and expansion fetched today twice without a pending guard. Reserve the summary/expanded region, deduplicate an in-flight today request, use that newly authorized result plus six prior days, guard target/unmount races, and discard private expansion data on close/failure. Every reopen reauthorizes history/proof; no private cross-open cache. | Out-of-order friends, repeated expansion guard, seven summary calls instead of eight within expansion, in-flight today reuse, denial and detail/proof consent revocation between opens. |
| VS-14 | Logout initialized unused push; timeout/error retries could duplicate scripts/callbacks and setup could race logout. Reuse pending SDK initialization, remove failed script/callback resources, show logout progress, skip truly unused push, and persist only a non-sensitive device-use marker for cleanup after reload. Generation checks cancel late setup; cleanup waits for identity writes but not an unanswered permission prompt. Both opt-out and identity unlink are attempted before Auth logout. Cleanup failure is explicit and retryable. | Unused logout, concurrent setup, script failure/retry, load/init timeout with late success, rejected init reuse, prior use after reload, pending identity fetch/login/permission prompt, cleanup failure, account switch, shell progress and sign-out ordering. |
| VS-15 | Focus/poll responses could replace newer task mutations; Dashboard and To-Dos owned separate snapshots. Share one task state within the existing authenticated shell, deduplicate reads, invalidate reads before writes, apply saved rows immediately, preserve order and retain mutation errors. Key the provider by the authenticated user ID and clear known rows/readiness on recognized authorization loss. | Focus/interval overlap, complete/reopen versus delayed reads, failed writes/reads, successful edit order, navigation reuse, account reset, authorization failure and unmount. |

The task provider is the only added shared state scope. `user-clock.tsx` exposes its already-loaded user ID solely to key this provider; startup, preference gating and timezone behavior were not changed. No shared habit cache (VS-18), legacy Feed/Year cleanup, Notification information-architecture redesign, AI conversation persistence, server-action rewrite, schema migration, RLS or business-rule change was introduced. Calendar continues using the existing navigation handler. No artificial loading delays or forced reloads were added; the existing 15-second SDK deadline bounds service calls rather than delaying UI.

OneSignal initialization follows the [official Web SDK reference](https://documentation.onesignal.com/docs/en/web-sdk-reference): initialize once per page and clear external identity on logout. A definitively rejected SDK initialization remains failed on that page and reports that a fresh page is needed; retries do not call init twice. A network script failure can retry in place, and a timed-out pending load/init is reused. Physical-device/provider behavior still needs the checks below.

Files changed (16):

- `app/(app)/dashboard/page.tsx`
- `components/assistant/assistant-panel.tsx`
- `components/calendar/calendar-board.tsx`
- `components/dashboard/habit-grid.tsx`
- `components/dashboard/mobile-habit-list.tsx`
- `components/friends/friend-history.tsx`
- `components/layout/app-shell.tsx`
- `components/layout/user-clock.tsx`
- `components/notifications/notification-center.tsx`
- `components/proofs/proof-panel.tsx`
- `components/tasks/task-board.tsx`
- `lib/hooks/use-tasks.ts`
- `lib/push-browser.ts`
- `tests/p1-client.test.mjs` (new: 23 styled React/Chromium regressions with deferred transport)
- `tests/p1-push.test.mjs` (new: 13 SDK lifecycle regressions with controlled promises/deadlines)
- `docs/V1_RELEASE_BACKLOG.md`

| Final validation | Result |
| --- | --- |
| `node --test tests/p1-client.test.mjs tests/p1-push.test.mjs` | 36 passed; 0 failed |
| `node --test tests/*.test.mjs` | 151 passed; 0 failed, including P0 and database privacy/ownership regressions |
| `npm.cmd run typecheck` | Passed |
| `npm.cmd run lint` | Passed: 0 errors; one pre-existing `postcss.config.mjs` anonymous-default-export warning |
| `node node_modules/next/dist/bin/next build` | Passed on final source; all routes generated |
| `node scripts/ui-build.cjs` then `node scripts/ui-check.cjs` | 20 route/viewport checks passed at 375, 390, 430 and 1280px |
| Final scope/diff review and `git diff --check` | Passed; all changed application behavior is P1 or its narrow session-identity dependency |

Initial Node worker spawning was sandbox-blocked and rerun with authorized execution. The final production-build rerun encountered Windows EPERM on the generated `.next/static/87pMIRv4vHYizcM3m_74X` reparse-point directory; deleting only that verified generated path with approval allowed the final build to pass. No source artifact or migration was removed. Synthetic screenshot artifacts are under `out/p1-check/` and `out/mobile-check/`; the 375px pending Grid/proof and settled Dashboard images were inspected. These are local fixture checks, not live transport, Auth, Storage, Gemini or OneSignal delivery verification.

#### Exact post-deployment P1 checks (still required)

1. **VS-02:** With populated and empty accounts, throttle Notifications first entry. Confirm no premature empty history, unknown selectors cannot save linked choices, failed choices show retry, and known history/settings/drafts remain through polling and repeated opens.
2. **VS-05/06/15:** Use a saved-timezone fixture with four of five eligible activities complete. Resolve task/habit reads in both orders and confirm 80% only once both are available, matching the authorized friend summary. Navigate Dashboard -> To-Dos -> Dashboard repeatedly. Under slow focus/minute reads, create/edit/complete/reopen/delete tasks; no successful change or row order should revert. Fail a read and a write, then recover. Sign out and into a different account and verify no previous task content remains.
3. **VS-07:** At 375/390/430px and desktop, cold-load and revisit Day/Week/Month; verify the 600px frame and supporting sections, true empty versus unavailable states, and retained events while saving commitments/habit times. Follow task/habit events and verify the document/shell persists; modified/new-tab clicks retain native behavior.
4. **VS-09/10:** Open completed task and habit proofs with populated/empty lists on a slow connection; the form must not move when lists, errors or assessment controls arrive. Add note/link/real PNG/JPEG/WebP proof, open images repeatedly, assess, delete and close/reopen. Inspect network calls: image/assessment/reopen do not refetch owner lists, explicit Refresh and add do, and signed-image access is checked each time. Change target or navigate away mid-request. Verify upload failure cleanup and denial after completion/authorization changes.
5. **VS-11/12:** Submit a second slow assistant request after a long result, then exercise timeout/failure and recovery. Previous text stays visible and its old plan cannot apply. On phones, cold-load Grid with long names, scroll to the selected date and last row, switch Grid/List and navigate back; check preference persistence and that List behavior remains unchanged.
6. **VS-13:** With accepted friends A/B and unrelated C, expand several friend histories under throttling and repeated taps; confirm one current-day plus six prior-day reads per fresh expansion and stable summary space. Close, revoke detail/proof sharing or remove friendship, then reopen: private names/proofs must disappear, with no unrelated-account access. Signed image URLs keep the existing expiry limitation.
7. **VS-14:** On a physical iPhone Home Screen app and Android Chrome, test enable, script failure/retry, delayed SDK load, denied/unanswered permission, logout before any push use, and logout after opt-in including after page reload. Confirm visible logout progress, no redundant initialization, successful opt-out/unlink before Auth sign-out, and a clear retry path on cleanup failure. Sign in as B after A and deliver test pushes to both aliases: this device must not receive A's targeted push after cleanup. Verify clicks open the intended account's app. Check Safari/Firefox manually where applicable.

All P1 code work in this run is complete. Deployment and the production/manual checks above remain open. Stop here; P2 and P3 are not started.
