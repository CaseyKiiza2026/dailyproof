You are acting as the complete senior cross-functional product engineering team responsible for taking the existing DailyProof application from its current working state to a polished, secure, production-ready V1.

Operate with the combined judgment of:

- a Staff / Principal Software Engineer — architecture, technical decisions, maintainability
- a Senior Full-Stack Engineer — Next.js, TypeScript, React, Supabase, APIs and application logic
- a Senior Backend / Database Engineer — PostgreSQL, schema design, migrations, RLS, authorization and data integrity
- a Senior Frontend Engineer — responsive React UI, state management, accessibility and performance
- a Senior Mobile Web / UX Engineer — phone-first usability, touch interactions and responsive layouts
- a Senior Product Designer — information hierarchy, interaction design and consistency with the existing DailyProof visual identity
- a Senior Product Manager — scope, user flows, acceptance criteria and prioritization
- an AI / Agentic Systems Engineer — Gemini integration, tool calling, scheduling, reminders, proof assessment and guardrails
- a Security Engineer — authentication, authorization, privacy, secrets and abuse prevention
- a QA / Test Engineer — regression testing, edge cases, end-to-end flows and release validation
- a DevOps / Platform Engineer — Vercel deployment, environment configuration, scheduled jobs, external services and production readiness

Think across all of these disciplines when making decisions, but maintain one coherent architecture and one product direction.

Do not optimize one area at the expense of the whole product. A technically correct feature that is insecure, confusing on mobile, inconsistent with the data model, difficult to maintain, or unsuitable for deployment is not considered complete.

DailyProof already exists and works. Your responsibility is to complete and strengthen it, not rebuild it unnecessarily.
==================================================
CURRENT PROJECT STATE + OVERRIDES
==================================================

IMPORTANT:
The specification below was written before the latest foundation work.

These instructions OVERRIDE any contradictory instruction later in the specification.

FOUNDATION IS ALREADY COMPLETE.

Already implemented and validated:
- friendship authorization repair
- privacy-safe friend summaries
- persisted timezone model
- timezone-aware date handling
- unscheduled days neutral for streaks
- mobile Friends access
- mobile logout
- removal of dead quick-check-in control

The foundation migration has already been applied to hosted Supabase.


DO NOT redo the foundation phase unless a later feature requires a small compatible extension. 

Do not create another migration that reimplements or replaces the completed foundation migration. Extend the schema only when a new V1 feature requires it.

AI IS NOW PART OF THIS V1.
Ignore any later instruction that says:
- do not implement AI
- AI is future work
- AI is not part of this implementation

The complete V1 must include:
1. Mobile Dashboard correction
2. To-Dos
3. Calendar
4. Proof
5. Notifications / Nudges
6. AI Assistant
7. Final integration / responsive QA / Vercel readiness

Read the ENTIRE specification first so you understand how the systems connect.

However, implement ONE PHASE AT A TIME.

After each phase:
- run relevant focused tests
- run TypeScript/typecheck
- run lint
- verify mobile around 375px
- report exactly what changed
- STOP and wait for approval before beginning the next phase

Do not implement later phases early.
Do not refactor unrelated working code.
Do not rebuild the application.

IMPORTANT:
This is an EXISTING working Next.js + TypeScript + Tailwind + Supabase project.

DO NOT:
- rebuild the project from scratch
- migrate away from Next.js
- introduce FastAPI, Flask, Firebase, or another backend
- replace the existing Supabase architecture
- remove working features
- redesign the existing visual identity
- expose private Supabase service-role keys to the browser 

BEFORE EACH PHASE:
1. Inspect only the files and database objects relevant to that phase.
2. Reuse the architecture and foundation decisions already established.
3. Do not repeat the full repository audit.
4. Do not redo completed foundation work.
5. Implement incrementally and preserve existing working behavior.
6. After the phase, run the required validation and stop for approval.

PRESERVE:
- existing dark DailyProof aesthetic
- existing habit grid
- existing streak calculations unless a requirement below requires modification
- existing authentication
- existing friend system
- existing feed/realtime functionality
- existing server-action/Supabase architecture
- existing RLS security model

==================================================
PRODUCT MODEL
==================================================

DailyProof is an accountability and scheduling application.

Its core areas are:

1. DASHBOARD / DAILY PROOF
2. CALENDAR
3. TO-DOS
4. PROOF
5. FRIENDS / CIRCLE
6. ACTIVITY + NOTIFICATIONS
7. PROFILE / SETTINGS

The application must work responsively on desktop and mobile.

Desktop may retain sidebar navigation.
Mobile should use a clean bottom navigation.

Do not build a separate native mobile application.
The responsive web application is the mobile application for this version.

DailyProof V1 is a full responsive web application for BOTH desktop and mobile.

Mobile is not the scope of the entire project. Mobile responsiveness is a requirement for every feature.

Desktop remains a first-class experience and must preserve the existing sidebar/layout where appropriate.

Only Phase 0 is specifically a mobile Dashboard correction.

For every later phase — To-Dos, Calendar, Proof, Notifications, Reminders, Friends, and AI — implement the feature for BOTH desktop and mobile using the same underlying data and business logic.

==================================================
1. DASHBOARD / DAILY PROOF
==================================================

Preserve the existing habit tracking system.

The dashboard must show:
- today's scheduled habits/activities
- completion percentage
- current streak
- best streak
- completed count
- missed count

IMPORTANT COMPLETION RULE:

Only activities actually scheduled/due for that user's current local day count toward that day's percentage.

Example:

If 5 activities are due today and 4 are complete:
80%.

If Gym is scheduled Monday, Wednesday, Friday:
Gym must NOT affect Tuesday's completion percentage.

Preserve existing complete / missed / rest / vacation semantics.

==================================================
2. TO-DOS
==================================================

Introduce a proper one-off tasks system separate from recurring habits.

Create a tasks table with appropriate RLS.

Minimum fields:

id
user_id
title
description
due_at
scheduled_start
scheduled_end
status
priority
created_at
updated_at

Statuses:
- pending
- completed
- cancelled

The To-Dos page should display:

DUE TODAY
DUE TOMORROW
DUE THIS WEEK
DUE SOMEDAY

These are VIEWS/FILTERS over the same tasks data.
Do NOT duplicate tasks into separate tables.

Users must be able to:
- create
- edit
- delete
- complete
- reopen
- give a due date
- optionally schedule an exact time

==================================================
3. CALENDAR
==================================================

Add a proper calendar page inspired by Google Calendar / Cupla.

Use a maintained React calendar library such as FullCalendar rather than building date/time-grid rendering manually.

Support:
- month
- week
- day views
- today navigation
- previous/next navigation
- responsive mobile layout

Calendar should contain:

A. FIXED COMMITMENTS
Examples:
work
class
appointment
meeting

B. SCHEDULED TASKS

C. RECURRING HABIT ACTIVITIES when they have a scheduled time.

Create a commitments table with:
id
user_id
title
start_at
end_at
description
created_at
updated_at

Commitments are FIXED calendar blocks.

They DO NOT affect DailyProof completion percentages.

Tasks remain one task record.

If a task has scheduled_start/scheduled_end:
it appears on the Calendar.

It must NOT be copied into another table just because it is scheduled.

==================================================
4. PROOF
==================================================

Add proof submission.

When completing a habit/task, allow the user to attach:

- image
- screenshot
- text note
- URL/link

Use Supabase Storage.

Use a PRIVATE storage bucket.

Create proofs records that identify:
- owner
- associated task OR habit log
- proof type
- storage path or URL/text
- created_at
- sharing visibility

A proof must belong to the authenticated user.

Do not expose arbitrary storage paths publicly.

Use signed URLs when appropriate.

==================================================
5. FRIENDS / ACCOUNTABILITY
==================================================

Preserve the existing friend request architecture.

Friends should be able to see:

- username
- current streak
- daily completion percentage
- completed/total activity count
- recent DailyProof history

Clicking a friend should show recent days.

PRIVACY IS IMPORTANT.

Default privacy:
SUMMARY ONLY.

By default friends should NOT receive:
- habit names
- task names
- private descriptions
- proof images
- proof text

Add profile privacy settings such as:

activity_visibility:
- summary
- detailed

proof_visibility:
- private
- friends

Detailed information may only be returned when the owner explicitly opts in.

Enforce privacy on the SERVER/DATABASE layer, not only by hiding UI.

Update existing RPC/database policies where necessary.


6. NOTIFICATIONS

Existing nudges currently persist intent but do not deliver notifications.
This must be completed in this V1 so nudges and reminders result in actual notification delivery.

REMINDERS ARE A CORE FEATURE.


The user must be able to create scheduled reminders manually and through the AI assistant.

Examples:
- "Remind me to study ML at 7 PM"
- "Remind me 30 minutes before this task"
- "Remind me tomorrow morning"
- "If this task is still incomplete at 9 PM, remind me"

Create a reminders system with fields such as:

id
user_id
task_id nullable
habit_id nullable
title
message
scheduled_at
channel
status
sent_at
created_at
updated_at

Reminder channels should be designed to support:
- push
- email
- SMS

For V1, implement push notification delivery first using OneSignal.

A reminder must NOT depend on the browser remaining open.

Use a scheduled backend process to find due unsent reminders and deliver them.

Architecture:

User / AI
→ create reminder
→ persist reminder in database
→ scheduled backend job checks due reminders
→ notification service sends push
→ mark reminder as sent
→ add notification history entry

AI must be able to call:

create_reminder
update_reminder
cancel_reminder
get_reminders

The AI does NOT wait until reminder time itself.
It creates the reminder; the backend scheduler handles delivery.

Use the user's persisted timezone when interpreting reminder times.

Never send the same reminder twice.

If push delivery fails:
- preserve the reminder/notification record
- record the failure
- do not crash the application
  

NOTIFICATION HISTORY

Create a notifications table for application history with:

id
user_id
type
title
body
read_at
created_at
metadata

Support these events:
- DailyProof reminder
- task due soon
- scheduled reminder
- friend sent a nudge
- accepted friend completed/posted their DailyProof

Notification permission must be explicitly requested from the user.

Provide notification settings:
- enabled
- DailyProof reminder time
- friend activity on/off
- nudges on/off

A nudge should:
1. validate friendship
2. create database notification
3. attempt push delivery
4. appear in notification history

Do not break the app if external push delivery fails.
Database state should remain correct.



Database state should remain correct.


7. TIMEZONE — CRITICAL

The timezone foundation has already been repaired.

Preserve and reuse the existing persisted IANA timezone model and centralized timezone utilities.

New features introduced in this V1 — especially:
- To-Dos
- Calendar
- reminders
- notifications
- AI scheduling

Must use the existing canonical user timezone.

Do not create a second timezone system or revert to browser/server/Postgres-local date decisions.
The user's timezone is the canonical definition of:
- today
- tomorrow
- due today
- streak boundaries
- daily completion
- scheduled reminders

Do NOT allow:
browser local time,
Vercel/server time,
and Postgres UTC
to independently decide what "today" means.

Create centralized date/time utilities and reuse them.

Store timestamps in UTC.
Convert them using the user's timezone when interpreting calendar days.

================================================== 
================================================== 
==================================================
8. RESPONSIVE PHONE EXPERIENCE
==================================================
Desktop and mobile are both first-class DailyProof experiences.
This section defines mobile-specific responsive behavior; it does not make DailyProof a mobile-only application.

The existing compact mobile statistics layout should be preserved.

Do NOT restore the previous oversized statistic cards.

MOBILE HABIT DISPLAY

Support two mobile habit presentations:

A. GRID VIEW
- DEFAULT mobile view
- based on the original compact DailyProof habit grid
- preserve compact date/status cells
- habit names must remain readable
- horizontal scrolling is acceptable when needed
- preserve complete / missed / rest / vacation / empty states
- preserve scheduling rules
- preserve date/month navigation
- preserve filters and habit editing

B. LIST VIEW
- preserve the newer stacked mobile habit presentation
- available as an alternative view

VIEW SWITCHING

Add a compact Grid/List toggle near the existing mobile habit controls.

Persist the selected presentation using localStorage only.

Do NOT:
- add a Supabase column for this preference
- create a migration for it
- create a server action for it

If no preference exists:
default to GRID.

Desktop habit-grid behavior should remain unchanged.

Mobile navigation should ultimately prioritize:
- Dashboard
- Calendar
- To-Dos
- Friends
- Notifications/Profile

Touch targets must remain comfortable.

Calendar, task completion, proof upload, notifications and AI must all work properly on phone.

Test around 375px throughout implementation rather than treating mobile as a separate application.
==================================================
9. DATA + SECURITY
==================================================

Use Supabase migrations for ALL schema changes.

Add proper indexes and foreign keys.

Add RLS policies.

A user must never be able to edit another user's:
tasks
commitments
habits
proofs
notifications
settings

Friends may only view information explicitly permitted by privacy policy.

Never rely only on client-side filtering for authorization.

Do not put secrets in NEXT_PUBLIC variables.

==================================================
10. ENGINEERING QUALITY
==================================================

Keep business logic out of giant page components.

Separate:
- types
- database access/server actions
- business/date logic
- UI components
- hooks

Reuse existing architecture where reasonable.

Do not introduce microservices or unnecessary abstractions.

Add tests for critical pure logic:
- To-Do bucket classification
- timezone/date boundaries
- completion percentage
- recurring scheduled-day behavior

AFTER EACH PHASE:
- relevant focused tests
- typecheck / TypeScript
- lint
- verify affected UI around 375px where applicable

Run a full production build:
- after dependency/routing changes when needed to catch integration issues
- and mandatorily during the final Phase 7 validation
==================================================
11. MOBILE + DEPLOYMENT
==================================================

Application must be deployable on Vercel.

No localhost-only assumptions.

Document environment variables in .env.example without real secrets.

Update README with:
- architecture
- local setup
- Supabase requirements
- notification setup
- deployment steps

==================================================
12. DAILYPROOF AI ASSISTANT
==================================================
The DailyProof AI is an execution assistant, not merely a conversational chatbot. Its primary purpose is to help the user decide what to work on, schedule work around fixed commitments, reschedule unfinished work, trigger reminders through configured notification channels, and assess submitted proof. Wherever possible, useful AI responses should translate into real DailyProof actions rather than only giving textual advice.
Implement one DailyProof AI assistant using Google Gemini server-side.

Do NOT use:
- LangChain
- CrewAI
- AutoGen
- multiple agents
- direct browser access to the Gemini API key

Gemini must never write directly to Supabase.

Architecture:

User
→ DailyProof AI UI
→ server-side AI route/service
→ Gemini
→ structured action/tool request
→ existing application service/server-action layer
→ validation/business rules
→ Supabase

The same business operations used manually by the application should be reusable by AI.

AI capabilities:

- get today's work
- get tasks
- get calendar
- get commitments
- find free time
- create task
- update task
- schedule task
- reschedule task
- answer "what should I do next?"
- plan the week
- summarize weekly performance
- verify submitted proof
- create reminders
- update/reschedule reminders
- cancel reminders
- list upcoming reminders

Conceptual tools:

get_today
get_tasks
get_calendar
get_commitments
find_free_slots
create_task
update_task
schedule_task
reschedule_task
get_week_stats
verify_proof
create_reminder
update_reminder
cancel_reminder
get_reminders

SCHEDULING GUARDRAILS

AI must not:
- move fixed commitments
- create overlapping scheduled work without validation
- schedule invalid start/end ranges
- modify another user's data

AI scheduling must:
- respect authenticated ownership
- respect the user's canonical timezone
- work around fixed commitments
- consider due dates
- validate task existence
- use reasonable durations

For multi-item planning/rescheduling:
show the proposed plan to the user before persisting significant changes.

PROOF VERIFICATION

Gemini may inspect supported proof content and return:

verification:
- verified
- likely
- insufficient

Also return:
- confidence
- reason

Never claim proof verification is fraud-proof.

AI INTERFACE

Provide a simple responsive DailyProof assistant.

Useful starter actions:
- Plan my week
- What should I do next?
- Find time for this
- How am I doing this week?

Keep conversation history minimal for V1.

If Gemini fails, manual DailyProof functionality must continue working.
==================================================
IMPLEMENTATION ORDER — CURRENT
==================================================

Phase 0:
Final mobile Dashboard Grid/List correction

Phase 1:
Tasks schema/actions + To-Dos

Phase 2:
Commitments + Calendar

Phase 3:
Proof submission + private Supabase Storage

Phase 4:
Reminders + notification history + nudges + actual push delivery

Phase 5:
DailyProof AI Assistant

Phase 6:
Cross-feature integration + mobile QA

Phase 7:
Security/tests/production build/README/Vercel readiness

After EACH phase:
report and STOP for approval.
Do not skip straight to UI.

At the end, give me:

1. files changed
2. migrations created
3. architecture decisions made
4. tests run/results
5. anything still incomplete
6. exact manual test ste
