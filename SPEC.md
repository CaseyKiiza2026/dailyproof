# DailyProof — Project Spec

_A GitHub-style habit and accountability tracker. "Prove it. Every day."_

This document is the single source of truth for what DailyProof is, how it works, and what's been built so far. Drop this into your project root (`README.md` or `SPEC.md`) so any future session — with me or Claude Code — can pick up context instantly.

---

## 1. Concept

DailyProof turns daily habit consistency into visible proof, combining:
- A **monthly habit grid** (habits as rows, days as columns, GitHub-style cells)
- A **yearly heatmap** (GitHub contribution graph style)
- **Real-time accountability** between a small circle of friends — not a social network, no likes/comments/chat

**Core philosophy:** personal discipline first, lightweight accountability layered on top. Serious, premium, minimal. Not gamified, not childish.

**Scope note:** this is being built for personal use with one friend to test for ~1 month, but built with the full intended feature set (not a stripped MVP).

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS **v3.4.17** (not v4 — see note below) |
| Backend | Supabase (Postgres, Auth, Realtime, Row Level Security) |
| Icons | lucide-react |
| Dev tool | Claude Code (in VSCode) |
| Design | Claude Design (initial UI export), ChatGPT (color palette generation) |
| Hosting (planned) | Vercel |

**Important gotcha:** The project must stay on **Tailwind v3**, not v4. The original Claude Design export was built in v3 syntax (`tailwind.config.ts` with custom colors, `@apply` directives). Next.js's `create-next-app@latest` now defaults to v4, which uses a completely different config system and broke everything on first run. We downgraded and locked to v3.4.17. Do not upgrade to v4 without a full rewrite of the design system.

---

## 3. Brand identity

- **Name:** DailyProof (not "Discipline Grid" — renamed early on)
- **Tagline:** "Prove it. Every day."
- **Visual references used:** Apple Calendar dark mode (deep black, clean typography, pill controls), Airbuds (glowing cards, premium dark social feel), GitHub contribution graph (yearly heatmap structure)

### Core colors
```
Background:      #050706
Primary surface:  #0A0D0B
Secondary surface: #0D110F
Border:           rgba(255,255,255,0.08)
Complete:         #25D86F (proof-green)
Missed:           #FF554F (proof-red)
Rest:             #F59E0B (proof-amber)
Vacation:         #8B5CF6 (proof-violet)
Muted text:       rgba(255,255,255,0.35)
```

### Shape language
- Cards: 22–24px radius
- Pills: fully rounded
- Grid cells: 5px radius
- Glow reserved for active/progress states only

---

## 4. Core features (habit grid)

- Users create, edit, delete habits
- Habits = rows, days of selected month = columns
- Each cell cycles: **empty → complete → missed → rest → vacation → empty**
- Cell icons (not just color) for accessibility/clarity:
  - Complete = white Check icon
  - Missed = white X icon
  - Rest = white Moon icon
  - Vacation = white Plane icon
  - Empty = blank
- Habit row shows: name, category, monthly completion %
- Sticky habit name column on desktop, horizontal scroll for day cells
- Month/year selector

### Default starter habit categories
- ML / Career
- Fitness / Bulk
- Sleep / Recovery
- Discipline
- Business

### Default starter habits (not yet seeded in the UI)
1. 45 min ML minimum
2. Code something
3. Protein target
4. Calories target
5. Gym or recovery
6. Water
7. No social before 5 PM
8. Plan tomorrow

---

## 5. Scoring rules (agreed, implemented)

These rules were specifically corrected from a naive first pass — **write them down exactly as follows:**

- **Completion %** only counts days from the 1st of the month through **today** — future dates are never counted.
- A day/habit only counts toward the total if a **log row actually exists**. No row = not counted at all (not counted as missed).
- **Rest** and **vacation** statuses are excluded from both the numerator and denominator of completion % entirely.
- `completion % = complete / (complete + missed) * 100`, rounded.

### Streak rules (current streak + best streak)

A day is "successful" if ≥50% of that day's **logged** habits (excluding rest/vacation) are marked complete.

**Rest day handling:**
- 1st consecutive rest day → fully neutral, streak unaffected
- 2nd consecutive rest day → streak count **−1** (this also dims the tier color, see below)
- 3rd consecutive rest day → full break, streak resets to 0

**Vacation day handling:**
- Up to 7 consecutive vacation days → fully neutral, streak and tier color **frozen** (no penalty, no progress)
- 8th consecutive vacation day → full break, streak resets to 0

**Mixed-signal day (edge case):** if a day has zero complete/missed logs but different habits were marked rest on some and vacation on others, **vacation wins** — it's treated as a vacation day, not a rest day, since vacation is the stronger "day off" signal.

**Best streak:** tracks the highest value the running streak reached at any point in the scan — a later reduction or break does not erase a peak already reached.

**Today exception:** if today has zero logs yet, it's skipped (not treated as a break) so the streak isn't punished before the day is over.

**Edit window:** habit cells can only be clicked/edited for **today and yesterday**. Older days are permanently locked (frontend disables the cell, backend rejects the write). Edits made to *yesterday* (not today) are flagged with a `logged_late = true` boolean, shown as a small clock icon in the Feed for transparency — not to accuse, just to be honest that it wasn't logged in real time.

---

## 6. Streak tier color system (designed, not yet implemented in app)

Applies to: **avatar ring glow** (Feed, Friends list, Profile) and **Current Streak stat card** (full-card tint + border + soft outer glow — not just a border).

Card treatment: dark background stays dark, only border + soft bleeding box-shadow carry the tier color (avoids looking like a gaming app).

| Tier | Streak range | Hex | Feel |
|---|---|---|---|
| Base | 0–2 days | `#687280` | Neutral graphite, no glow |
| Spark | 3–6 days | `#2F8F5B` | First momentum |
| Ember | 7–13 days | `#B87A2A` | Warm discipline |
| Flame | 14–29 days | `#9F2F2F` | Deep pressure |
| Blaze | 30–89 days | `#D6A62C` | Serious gold |
| Inferno | 90–179 days | `#D65A31` | Visible heat |
| Legend | 180–364 days | `#8B6FD6` | Rare status |
| Mythic | 365+ days | shifting gradient (gold → violet → teal) | Full-year proof, subtle animated glow |

Tier is driven by **current streak** (not per-habit). The moment a streak fully breaks, tier resets instantly to Base. Visible to friends — same ring glow shown wherever their avatar appears.

---

## 7. Accountability features (designed, not yet built)

- **Real-time feed** — live check-ins as they happen: "Jethro completed 45 min ML minimum." No likes, comments, or chat.
- **Friends system** — add/accept by username, each user keeps their own personal habit list (not forced to match).
- **Habit templates** — users can share a habit template; friends can copy and customize it. Planned shared templates: ML Grind, Bulk Discipline, No Social Before 5 PM, Sleep Recovery, Gym Consistency.
- **Nudge button** — one tap to remind a friend who hasn't logged today.
- **Daily notes** — one note per day (not per habit), e.g. "Worked overnight, did minimum ML."
- **Secondary feature:** end-of-day summary (lower priority than real-time feed).

---

## 8. Database schema (implemented in Supabase)

```sql
-- profiles: one row per user, auto-created on signup via trigger
profiles (
  id uuid primary key references auth.users,
  username text unique,       -- chosen at signup, validated live, lowercase/numbers/underscores, 3-20 chars
  avatar_url text,
  bio text,
  is_public boolean default false,
  created_at timestamptz default now()
)

-- habits: one row per habit a user creates
habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  name text not null,
  category text not null,
  is_core boolean default true,
  order_index int default 0,
  created_at timestamptz default now()
)

-- habit_logs: one row per habit per day it was marked (no row = empty)
habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid references habits on delete cascade,
  user_id uuid references auth.users on delete cascade,
  log_date date not null,
  status text check (status in ('complete','missed','rest','vacation')),
  logged_late boolean default false,   -- true if edited on the "yesterday" grace day
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (habit_id, log_date)
)
```

Row Level Security is enabled on all tables — users can only read/write their own habits and logs. Profiles are publicly readable (needed for friend search later) but only self-editable.

**Not yet built:** `friendships`, `feed_events`, `habit_templates`, `template_habits`, `daily_notes` tables (designed in early planning, not yet created).

---

## 9. What's actually built and working right now

- ✅ Full dev environment (VSCode + Claude Code + Supabase + Next.js, Tailwind v3 locked)
- ✅ Real authentication (signup/login, Supabase Auth)
- ✅ Custom usernames at signup with live availability check
- ✅ Habit grid UI imported from Claude Design, restyled with status icons (Check/X/Moon/Plane)
- ✅ Real habit + habit_logs data wiring (no more mock data)
- ✅ Click-to-cycle with today/yesterday edit window enforcement (server-side date check)
- ✅ Accurate completion % calculation
- ✅ Accurate streak calculation including rest/vacation escalation rules, verified via simulation
- ✅ Streak tier color palette designed and validated with live CSS preview

## 10. What's next (roadmap, in order)

1. **Add Habit UI** — create real habits (currently zero habits exist on the account)
2. **Apply streak tier colors** to avatar ring + streak stat card in the actual app
3. **Yearly heatmap** wired to real data
4. **Daily notes** per day
5. **Friends system** — add/accept requests, `friendships` table
6. **Real-time feed** — `feed_events` table + Supabase Realtime subscription
7. **Nudge button**
8. **Habit template sharing** — `habit_templates` + `template_habits` tables
9. **Notifications** (daily reminder, streak-at-risk, friend nudge)

---

## 11. Known open items / flagged edge cases

- Date math for "today/yesterday" edit window uses the server process's local timezone — no per-user timezone column exists yet. Fine for one-timezone testing (you + one friend), worth revisiting before wider use.
- Mock fixtures (`initialHabits`, `monthDays` in `lib/mock-data.ts`) were left in place even though nothing imports them anymore — harmless, can be deleted later.
- Email confirmation is currently **disabled** in Supabase Auth settings for faster local testing — re-enable before any real public launch.

---

_Last updated: end of the initial build session covering auth, habit grid data wiring, and streak tier design._
