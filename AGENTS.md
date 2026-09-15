<!-- BEGIN:nextjs-agent-rules -->
# Next.js local-doc rule

This repository may use Next.js APIs/conventions newer than model training data.
Before changing framework-specific behavior, inspect the relevant documentation in:
`node_modules/next/dist/docs/`

Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# DailyProof Repository Instructions

## Project

DailyProof is a responsive accountability, habit, scheduling, proof, and social accountability application.

This is an EXISTING application.
Do not rebuild or replace working architecture unless explicitly requested.

## Stack

- Next.js
- TypeScript
- Tailwind CSS
- Supabase Postgres
- Supabase Auth
- Supabase Storage
- Supabase Realtime
- Vercel deployment

Do not introduce a separate Flask/FastAPI backend, Firebase, or another database unless explicitly requested.

## Architecture

Prefer the existing structure:

- `app/` — routes/pages/layouts
- `components/` — UI
- `lib/actions/` — server-side writes/business operations
- `lib/hooks/` — client data/state hooks
- `lib/supabase/` — Supabase clients
- `lib/` — pure domain/date/stat utilities
- `supabase/migrations/` — schema changes

Keep business logic out of large page components.

## Database

All schema changes must be implemented through Supabase migrations.

Use:
- foreign keys
- indexes where appropriate
- Row Level Security
- authenticated ownership checks

Never rely only on client-side filtering for authorization.

Never expose the Supabase service-role key in client code.

## Time

Store timestamps in UTC.

User timezone is the canonical source for:
- today
- tomorrow
- streak boundaries
- task buckets
- reminder dates

Do not independently use browser/server/database local clocks to determine calendar-day business logic.

## Privacy

Friend-visible information must respect persisted privacy settings.

Default friend visibility should be summary-only.

Do not expose:
- private task names
- habit names
- descriptions
- proof contents

unless the owner explicitly allows it.

Privacy must be enforced at the server/database layer.

## Mobile

Mobile is a first-class layout.

Every core user flow must work at approximately 375px width.

Do not create a separate native app for this version.

Avoid shrinking desktop-only layouts into unusable mobile layouts.

## AI

Do NOT implement the AI assistant unless explicitly requested.

However, application actions should be designed so a future AI layer can call them safely.

AI should never write directly to the database.

## Existing Features

Preserve working:
- authentication
- habits
- recurring schedules
- stats
- streaks
- friend requests
- feed/realtime behavior
- existing visual identity

Do not remove or rewrite working features merely to simplify implementation.

## Development Workflow

Before substantial changes:

1. Inspect relevant existing code.
2. Explain the proposed implementation.
3. Identify files/migrations to change.
4. Make the smallest coherent change.
5. Run validation.
6. Fix failures before continuing.

## Validation

Before considering a phase complete, run the available equivalents of:

- lint
- TypeScript typecheck
- tests
- production build

Do not claim success unless these pass or clearly report what failed.

## Coding Style

Prefer:
- small focused functions
- explicit TypeScript types
- shared domain utilities
- reuse over duplication
- clear server/client boundaries

Avoid:
- unnecessary abstractions
- premature microservices
- duplicated business logic
- large monolithic components
- unrelated refactors during feature work

## DailyProof V1 Source of Truth

The authoritative product specification for the current build is:

`docs/DAILYPROOF_V1_SPEC.md`

Before starting each implementation phase:
1. Read the relevant section of `docs/DAILYPROOF_V1_SPEC.md`.
2. Confirm the phase requirements before making changes.
3. Do not implement requirements from later phases early.
4. After completing the phase, compare the implementation against the spec before reporting completion.
5. If existing code conflicts with the spec, preserve working behavior where possible and explicitly report the conflict rather than silently changing product requirements.

The CURRENT PROJECT STATE + OVERRIDES section at the top of the spec takes precedence over older contradictory instructions.