# Assistant execution repair

Branch: `fix/assistant-execution-tools`, based on local `main` at `004fea3`.
No merge, deployment, production data mutation, dependency update, or hosted migration was performed.

## Findings before changes

There was no read-only/free-tier switch. `geminiJson` sent a structured JSON response schema containing **both** reads and task/reminder writes. It did not use native Gemini `functionDeclarations`; operations were JSON proposals interpreted by the server. The repair preserves that method.

The following defects were established from the code and reproduced where applicable:

- Commitment create/update was absent from the model schema, normalizer, `WorkAction`, and shared database router. It could not execute at all.
- `complete_task` and `reschedule_reminder` were absent as explicit aliases. Their underlying operations already existed as task/reminder updates.
- Every task update passed through AI scheduling restrictions, including a completion-only update retaining a past schedule. This rejected legitimate completion and edits. Scheduling restrictions now apply when the schedule actually changes; database constraints still run on every write.
- Apply did not invalidate TasksProvider or CalendarProvider or refresh the route. Persisted changes could appear missing. Home uses the same TasksProvider and existing progress calculation.
- Write arguments were opaque JSON-encoded strings. Unlike read arguments, they had numerous required domain fields and identity conventions with no operation-specific model schema. The new shared registry supplies narrow structured object schemas and checks their fields at runtime. The parser retains compatibility with encoded object strings.
- Local datetime strings were rejected instead of being resolved through the saved timezone utility. Writes and free-slot reads now use that utility; DST gaps/repeated hours remain errors.
- Preparation errors were reduced to a generic reference, and Apply threw server errors. Typed failures now distinguish provider throttling, request limits, proposal validation, scheduling, and Apply uncertainty without exposing private details.
- Follow-up clarification had no prior request context. One bounded question/reply is now passed when the previous response had no proposal.

These are specific application defects, not proof that every reported production failure had the same cause. No production request trace or safe test-account session was available to attribute a particular production failure to RLS or provider configuration.

## Pipeline audit

| Stage | Finding / repaired behavior |
| --- | --- |
| Model configuration | Server-only environment configuration is preserved. Primary is `gemini-3-flash-preview`; fallback is `gemini-3.6-flash`. No API key was printed. |
| Prompt | Explicit execution proposals, optional defaults, one clarification for ambiguity, fixed-event distinction, no invented recurrence, and no automatic commitment movement. |
| Tool declarations | One registry covers reads and all requested writes; completion and reminder rescheduling map to existing updates. No unrestricted database tool. |
| Structured schema | Uses `responseJsonSchema`, with operation-specific alternatives and typed arguments. No native function-call parts are expected or executed. |
| Parsing | Rejects unsupported operations, unexpected fields, wrong types, invalid IDs and missing required arguments. Domain validators remain authoritative. |
| Proposals | Owner-scoped immutable action JSON is inserted into existing `ai_plans`; no work mutation occurs during proposal creation. |
| Rendering | Existing generic proposal cards render validated final values, including commitment timestamps in the saved timezone. Layout/classes are preserved. |
| Apply / retry | Revalidates server-side, executes the existing transactional plan RPC, checks its returned result, and resolves an already-applied plan without replaying it. Failure preserves the proposal. |
| Keep / Discard | There was no Keep button or separate Keep operation in this application. Pending proposals remain reviewable. Discard dismisses the local result, does not execute work, and the existing database plan expires after 20 minutes. No new plan-deletion RLS was introduced. |
| Router | Existing `apply_ai_plan` calls `apply_work_actions`. The latter gains narrow commitment operations via an additive migration. |
| Tasks | Same validator/shared RPC as manual UI. Scheduling does not copy tasks into commitments. Completion preserves the task's existing fields. |
| Commitments | Manual `saveCommitment` and reviewed plans now share the same validator and transactional router; existing overlap/ownership triggers are unchanged. |
| Reminders | Same reminder validator, RPC, pending-state rules and backend notification delivery. Commitment-relative reminders are standalone reminders, not task links to commitment IDs. |
| Auth / ownership | Existing `requireUser`, saved timezone, owner filters, security-invoker RPC and RLS remain intact. Owner ID is never accepted as a tool argument. |
| Persistence / RLS | Isolated PostgreSQL tests verify actual inserts/updates, cross-account rejection, rollback on a failing action and plan status. Hosted RLS failures were not observed or inferred. |
| State / cache | Explicit task/calendar invalidation discards pre-write reads; reminders receive a refresh event if mounted and reload on normal route mounting. `router.refresh()` updates route state. It is not relied upon to reset client providers. |
| Errors / success | Success follows confirmed transaction results or persisted applied status. Safe typed failures preserve retry. Rate limits are provider errors, not unsupported-action answers. |

## Model verification

Google lists function calling and structured output support for both configured models:

- [Gemini 3 Flash preview](https://ai.google.dev/gemini-api/docs/models/gemini-3-flash-preview)
- [Gemini 3.6 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash)
- [Structured output method](https://ai.google.dev/gemini-api/docs/structured-output)

Synthetic live smoke requests used no application/user records and performed no database writes. Across three runs, the primary returned 503, 400, then 503; fallback returned 400, 429, then 429. No successful live proposal was obtained. The 400 cause was not established; this report does **not** claim live acceptance of the new schema. The final fallback response was classified as quota-related using fixed keyword matches, without logging its body. Existing bounded retries, fallback policy and deadlines are unchanged and covered by mocked HTTP tests. No paid-tier requirement was added.

## Changed files and reasons

| File | Reason |
| --- | --- |
| `lib/assistant-tools.ts` | Shared narrow read/write registry, model schema, argument validation and canonical datetime conversion. |
| `lib/actions/assistant.ts` | Consume registry, normalize requested aliases and commitments, retain clarification context, confirm persistence and support safe Apply retries. |
| `lib/ai-tools.ts` | Map progress/weekly-summary aliases to existing integrated weekly stats. |
| `lib/assistant-diagnostics.ts` | Safe actionable error categories, including provider quota and typed Apply failures. |
| `lib/calendar.ts` | Extract the existing commitment validation into a reusable function. |
| `lib/actions/calendar.ts` | Route manual commitment saving through the shared validated mutation service. |
| `lib/work-actions.ts` | Add commitment action types and reuse commitment validation. |
| `lib/work-schedule.ts` | Distinguish schedule changes from edits/completion; include proposed commitments when checking task schedules. |
| `lib/hooks/use-tasks.ts` | Explicit invalidation of old reads followed by refreshed task state. |
| `lib/hooks/use-calendar-data.ts` | Explicit calendar invalidation without reusing a stale in-flight read. |
| `components/assistant/assistant-panel.tsx` | Typed Apply handling, duplicate-click guard, provider refresh, minimal clarification context, commitment date labels. No visual redesign. |
| `components/notifications/notification-center.tsx` | Refresh mounted reminder state after successful Apply. |
| `supabase/migrations/20260927120000_assistant_commitment_actions.sql` | Extend shared transactional writes with commitment create/update and stale-update checks. |
| `tests/assistant-execution.test.mjs` | Real server actions and real isolated PostgreSQL functions behind mocked transport/provider boundaries. |
| `tests/assistant-client.test.mjs` | Real Assistant and providers at mobile/desktop widths: failure, retry, duplicate click, discard, immediate refresh, stale read. |
| `tests/assistant-provider-errors.test.mjs` | Explicit, redacted provider throttling result. |
| This report | Audit, validation evidence, rollout requirement and limitations. |

One **database-function migration** is necessary for commitments to participate in the existing atomic plan transaction. No tables, columns, constraints, grants, RLS policies, auth/session code, routes, themes, dependencies, notification infrastructure, progress calculations, or existing tests were changed. It must be applied to the intended environment before using the updated commitment save path. It was applied only to disposable test databases here.

## Validation commands

- `node --test tests/assistant-execution.test.mjs tests/ai-context.test.mjs tests/assistant-diagnostics.test.mjs tests/gemini-retry.test.mjs` — 43 passed at the initial focused checkpoint.
- `node --test tests/assistant-client.test.mjs` — 2 passed at the initial mobile/desktop checkpoint; a stale-read test was subsequently added and included in full regression.
- `npm.cmd run typecheck` — passed after fixing a new TypeScript narrowing error.
- `npm.cmd run lint` — passed with the existing `postcss.config.mjs` anonymous-export warning after fixing a new test-variable lint error.
- `node --test tests/*.test.mjs > out/assistant-regression.log 2>&1` — first sandbox attempt failed with process-spawn `EPERM`; rerun with approved escalation passed. Includes task, Calendar, reminders, progress, proof, security, provider retries and all existing browser regressions.
- `node node_modules/next/dist/bin/next build` — production build passed.
- `node out/assistant-model-smoke.cjs` — three synthetic live runs, provider errors as recorded above. This ignored local diagnostic helper contains no credentials; it reads existing server environment variables at runtime.

Final verification after the typed Apply-error change:

- Typecheck: passed.
- Lint: passed, zero errors; one pre-existing `postcss.config.mjs` warning.
- Full regression: **196 passed, zero failed/skipped** (52.56 seconds).
- An additional explicit new-task-with-description/due-date/schedule case was then added; `node --test tests/assistant-execution.test.mjs` passed **15 tests**. No application code changed after the final full regression.
- `node node_modules/eslint/bin/eslint.js tests/assistant-execution.test.mjs` — passed after that additional test.
- Production build: passed on the final application code. Two earlier rebuild attempts encountered `EPERM` replacing `.next/static/_1v-niFf_Z9VPIhx8zMzi`, including an escalated retry. After checking the exact resolved workspace path, the generated artifact directory was removed with native PowerShell `Remove-Item -LiteralPath ... -Recurse -Force`, and the same build command passed. No source files were deleted.
- `git diff --check`: passed (Git emitted only line-ending notices).

## Manual workflow status and remaining limitations

No disposable local/staging account or existing session was supplied. Therefore the requested **manual signed-in workflow has not been performed**, and no production data was changed to substitute for it. Isolated automated coverage confirms proposal-first task creation, due dates, scheduling/rescheduling, commitment create/update, reminder create/reschedule, completion, conflicting schedules, retries and duplicate Apply protection. Browser tests confirm real client/provider integration with synthetic transport; they are not represented as a live account test.

Before deployment, run the requested eight-step manual workflow against a disposable account after applying the migration: create/apply a task and inspect To-Dos; schedule it and inspect Calendar; create a commitment; create a reminder; complete a due-today task and inspect Home; attempt a conflicting interval; retry/double-Apply and verify a single persisted record. Live Gemini acceptance of the new response schema must also be verified once provider requests succeed.

Unsupported by design: recurring commitments, automatic movement of fixed commitments during planning, habit/friend/account mutations, deletion tools and unrestricted database operations. Existing proof assessment remains an assessment, not fraud-proof verification. Multi-action failures remain atomic; the router may reject a complex commitment/task rearrangement whose intermediate order conflicts rather than partially applying it.
