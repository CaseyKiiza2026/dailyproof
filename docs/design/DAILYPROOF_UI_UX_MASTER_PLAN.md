# DailyProof UI/UX Master Plan

> Living source of truth for the DailyProof redesign.  
> Put this file in your repo as `docs/DAILYPROOF_UI_UX_MASTER_PLAN.md`.

## How this fits with the rest of the project

Use three sources of truth:

**Engineering/release:** `docs/V1_RELEASE_BACKLOG.md`  
Tracks P0, P1, P2, P3 and Final QA.

**UI/UX:** `docs/DAILYPROOF_UI_UX_MASTER_PLAN.md`  
Tracks visual direction, page designs, interaction decisions, motion, emotional design, and P3 implementation.

**Figma:** visual source of truth  
Approved screens, components, variants, spacing, light/dark themes, and responsive layouts.

Do not rely on chat history as the source of truth.

---

# Current release sequence

## P2 first

Before P2 begins, fix the remaining P1 Calendar carryover:

### Calendar carryover

**Production symptom**
- Calendar can briefly look empty before real events arrive.

**Target behavior**
- Known events stay visible during repeat navigation and background refresh.
- First load must not falsely look like a legitimate empty calendar.
- Loading/unresolved data must be distinguishable from a true empty calendar.
- Prefer shared/cached/seeded known state over a spinner-only workaround.
- Preserve current Calendar business rules and navigation.

**Do not solve with**
- arbitrary delays
- forced reloads
- fake placeholder events
- disabling navigation
- giant spinner-only experiences

**Regression requirements**
- repeat navigation does not flash empty when events are already known
- refresh preserves known events
- genuine empty calendar is still possible
- failed reads do not erase known events
- task/habit internal navigation still works

## P2 shared + legacy stability goals

### Root clock/preferences
- Reduce cold-entry shell → page transitions where architecture allows.
- Preserve timezone correctness.
- Prefer known/server-seeded/session state over fake defaults.

### Dashboard / Feed / Year
- Never show fabricated zero/empty stats before data is known.
- Preserve known values during background refresh.
- Distinguish loading, error and legitimate zero.

### Shared habit state
- Stop shell/Dashboard/Feed/Year from showing different habit snapshots.
- Share authenticated habit state narrowly.
- Successful local mutations should propagate consistently.

### Friends
- Never show “No friends” while friendships are unresolved.
- Reserve stable list space.
- Preserve privacy/authorization.

### Feed summaries
- Do not flash “Nothing here yet” between dependent requests.
- Keep known summaries during refresh.

### Leaderboard
- Keep visible rankings while revalidating.
- Avoid unnecessary friend refetches.

### Profile
- Stabilize route loading.
- Parallelize independent reads where safe.
- Preserve server rendering and privacy behavior.

### Activity expansion
- Stabilize the 7-day expansion footprint.
- Preserve privacy reauthorization.
- Avoid one-line loading states exploding into many cards.

### Friend search / username availability
- Explicit error states.
- Stale results must not look current.
- Lookup failure must never mean “username available.”

---

# P3 goal

P3 is not “make it prettier.”

DailyProof should feel:

- simple
- premium
- human
- intentional
- trustworthy
- consumer-friendly
- emotionally rewarding
- not template-like
- not “vibe coded”

Core product direction:

> **A premium execution app that makes discipline feel approachable, tangible and emotionally rewarding.**

Internal design rule:

> **Make progress feel alive.**

---

# Design workflow

1. Freeze the visual direction.
2. Define design tokens.
3. Define shared components.
4. Design the mobile shell.
5. Design each mobile page.
6. Design light theme.
7. Adapt the system to desktop.
8. Define loading, empty, error and refresh states.
9. Define motion/emotional behavior.
10. Build shared components.
11. Implement pages.
12. Storybook/component QA.
13. Compare implementation against Figma.
14. Responsive QA.
15. Real-device QA.
16. Final polish pass.

Do not redesign individual pages directly in code before the design system is established.

---

# Recommended tools

## Figma — visual source of truth

Use Figma for:
- mobile screens
- desktop screens
- design tokens
- component variants
- light/dark modes
- prototypes
- final frame references for Codex

Do not use Canva as the application UI source of truth.

## Codex — implementation engineer

Use Codex to:
- implement approved designs
- create reusable components
- connect them to existing Next.js/Supabase behavior
- add tests

Do not ask Codex to invent aesthetics page-by-page.

## Tailwind CSS

Use semantic tokens for:
- colors
- spacing
- typography
- radii
- responsive behavior

Avoid random one-off arbitrary values.

## shadcn/ui + Radix

Use as low-level accessible primitives for:
- dialogs
- sheets
- tabs
- menus
- popovers

They are implementation primitives, not the DailyProof visual identity.

## Lucide

Use one icon family consistently.

Avoid mixing emoji, Heroicons, Material icons, random SVGs, Unicode symbols and generated icons.

## Storybook

Use it to test components in isolation:
- default
- hover
- pressed
- disabled
- loading
- error
- long text
- dark
- light
- mobile
- desktop

## Mobbin / mature app references

Use for interaction patterns, not branding:
- task creation
- calendar event selection
- notification inboxes
- settings
- AI composers
- bottom sheets
- onboarding

---

# Approved visual direction

The generated DailyProof design board is the visual target.

Do not keep generating unrelated aesthetics.

## Personality

- dark
- calm
- focused
- premium
- modern
- approachable
- restrained

## Emotional balance

Use a balance closer to:

**Phantom / Revolut**
- refined
- crisp
- premium
- restrained
- trustworthy

plus some **Duolingo**
- personality
- feedback
- delight
- progress celebration

DailyProof must not become childish.

---

# Theme system

Support:

- System
- Light
- Dark

Default: **System**

Use semantic tokens, for example:

```text
bg.page
bg.surface
bg.surfaceRaised

text.primary
text.secondary
text.muted

border.default

accent.primary
status.success
status.warning
status.danger
status.info
```

## Dark direction

- near-black page background
- charcoal surfaces
- slightly lighter raised surfaces
- soft-white primary text
- muted cool-gray secondary text
- subtle borders
- restrained emerald accent, not neon

## Light direction

- soft off-white page
- white surfaces
- very-light-gray raised surfaces
- near-black primary text
- medium-gray secondary text
- subtle borders
- slightly deeper green accent

Do not simply invert dark mode colors.

---

# Typography

Recommended family: **Inter**

Suggested hierarchy:

```text
Display/progress number     36–40px / Semibold
Page title                  26–28px / Semibold
Section title               18px / Semibold
Card/row title              15–16px / Medium/Semibold
Body                        14–15px / Regular
Secondary                   13px / Regular
Metadata                    11–12px / Medium
```

Typography should create hierarchy before borders and cards do.

---

# Spacing

Recommended scale:

```text
4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48
```

Mobile defaults:

```text
Horizontal page padding     ~20px
Section gap                 28–32px
Item gap                    12px
Compact control gap         8px
Bottom navigation           ~64px + safe-area inset
```

Avoid random spacing values across pages.

---

# Card / surface philosophy

Do not put everything inside a card.

Prefer:
- clean sections
- compact rows
- subtle separators
- cards only where grouping improves comprehension

Avoid:
- giant rounded rectangles everywhere
- heavy shadows
- excessive nested cards
- excessive badges
- generic SaaS/dashboard-template styling

---

# Responsive navigation

## Mobile

Bottom navigation:

```text
Home
To-Dos
Calendar
Assistant
More
```

Top-right:
- notification bell
- avatar/profile

`More` contains:
- Proof
- Friends
- Profile
- Settings

Notifications should not be a primary bottom-nav destination.

## Tablet

Consider a compact navigation rail.

## Desktop

Use a quiet persistent left sidebar:

```text
Today
To-Dos
Calendar
Assistant
────────
Proof
Friends
Settings
```

Recommended:
- around 220–240px wide
- muted icons
- subtle active state
- minimal borders
- content remains visually dominant

---

# Mobile-first design order

Design in this order:

1. Shell/navigation
2. Home/Dashboard
3. To-Dos
4. Calendar
5. Assistant
6. Proof
7. Friends
8. More/Settings
9. Notification inbox
10. Light theme
11. Desktop adaptations

---

# Home / Dashboard

Home should answer in roughly two seconds:

**How am I doing?**  
**What do I need to do?**  
**What should I do next?**

Recommended hierarchy:

1. Greeting + date
2. Today completion/progress ring
3. Habit progress
4. Today’s priorities
5. Upcoming schedule

Do not turn Home into a pile of stat cards.

---

# Habit Grid + List

Keep both mobile modes.

## Grid

Best for habits because habits are repetitive and highly scannable.

Use a compact 2-column grid with:
- habit name
- progress/status
- minimal icon
- completion action
- restrained progress indicator

## List

Use for users who prefer denser detail.

Remember Grid/List preference locally.

## Tasks

Keep tasks primarily list-based because tasks need:
- time
- due date
- category
- priority
- schedule context

Do not force tasks into grid cards.

---

# To-Dos

Use:
- compact rows
- clear completion controls
- Today / Upcoming / Completed segmentation
- easy Add Task
- secondary metadata
- restrained category/status badges

Avoid giant task cards.

---

# Calendar

Calendar should feel stable and trustworthy.

Rules:
- never falsely appear empty while unresolved
- retain known events during refresh
- keep frame/layout stable
- visually distinguish fixed commitments
- AI cannot move fixed commitments
- Calendar and To-Dos remain views of the same task records

Use motion to explain changes:
- rescheduled items visibly transition
- selected-event detail feels spatially connected to the item

---

# Assistant redesign

Replace the giant-textarea experience with a proper conversational UI.

Requirements:
- bounded persistent active conversation
- message history
- separate composer
- composer clears after sending
- conversation survives internal navigation
- Markdown rendering
- compact quick-action chips
- clarification messages
- pending plans remain visible
- explicit Apply / Edit / Cancel
- plan proposal cards
- stable loading/streaming states
- old results remain visible while new requests process

Quick actions should be small chips such as:

```text
Plan my week
What's next?
Find time
```

Example proposal:

```text
ML Course Progress
Friday · 3:00–5:00 PM

[Apply] [Edit] [Cancel]
```

---

# Notifications

Reconsider the dedicated Notifications page.

Recommended architecture:

## Header bell
Acts as:
- inbox
- history

Examples:
- friend nudge
- reminder
- proof status
- schedule update

## Settings
Notification preferences live under Settings.

## Reminders
Reminder creation belongs contextually with:
- tasks
- habits
- calendar items

A dedicated Notifications page may be unnecessary.

---

# Proof

Proof should feel like evidence, not generic file upload.

Use:
- real thumbnails
- timestamp/context
- clear relationship to completed work
- stable upload state
- assessment status
- delete action
- clear sharing state

Successful proof submission should feel meaningful, but not corny.

---

# Friends

Prefer a clean list:
- avatar
- name
- concise streak/progress
- View
- Nudge where relevant

Avoid giant social cards.

Prioritize:
- accountability
- privacy
- consent
- lightweight encouragement

No public-shame mechanics.

---

# More / Settings

Use clean grouped rows.

Possible groups:
- Profile
- Appearance
- Habit settings
- Notifications
- Privacy
- Help
- Log out

Appearance:
- System
- Light
- Dark

---

# Emotional design

DailyProof should not merely be functional.

Target:

> **Alive, responsive and human without becoming childish.**

Every screen should answer:

1. What should the user understand?
2. What should the user feel?

Core rule:

> **Routine actions feel smooth. Progress feels rewarding. Milestones feel memorable. Failure feels recoverable.**

---

# Emotional interaction levels

## Level 1 — Micro feedback

For:
- buttons
- toggles
- Grid/List switch
- navigation
- date selection
- menus
- message send

Possible behavior:
- slight press compression
- subtle glow
- quick spring/fade

Typical motion:
- ~120–180ms

Keep it tactile but quiet.

## Level 2 — Progress feedback

When progress changes:
- animate progress ring
- animate numbers
- progress bars advance smoothly
- brief accent pulse

Example:

```text
Habit completed
→ checkmark draws
→ progress ring advances
→ 68% becomes 74%
→ subtle glow settles
```

The action should feel like it mattered.

## Level 3 — Small wins

Examples:
- first completed item of the day
- all scheduled habits complete
- priorities complete
- proof submitted
- daily target reached

Use restrained celebration.

Example:

```text
4 / 4 today
Day cleared.
```

Avoid constant confetti.

## Level 4 — Milestones

Examples:
- first complete day
- 7-day streak
- 30-day streak
- first perfect week
- personal record
- 100 proofs

These can use stronger modal/full-screen moments.

Keep them rare.

---

# Streak motion

Streaks should feel alive.

Possible behavior:
- subtle idle motion
- glow changes
- number animates
- completion creates small upward movement
- tiny particles dissipate
- visual settles

A streak should feel like something the user has grown.

---

# Loading with personality

Animate only unavoidable waits.

Never slow the product to show an animation.

Possible branded loading:
- DailyProof mark draws itself
- subtle pulse
- content resolves

Assistant thinking:
- branded flowing indicator instead of generic spinner

Calendar:
- stable calendar frame first
- events appear without an empty flash

---

# Motion as explanation

Use animation to explain relationships.

Examples:
- detail sheet grows from selected task
- rescheduled event visibly moves
- AI proposal card transforms into applied state
- uploaded proof transitions into its final proof item

Avoid motion that exists only to show off.

---

# Mascot / character direction

Do not commit yet.

## Option A — No mascot
Animate the DailyProof leaf/brand mark.

## Option B — Abstract companion
A branded object derived from the DailyProof mark that can:
- pulse
- grow
- react
- celebrate
- evolve with streaks

This is the strongest direction to explore first.

## Option C — Full character
Highest personality, but highest risk of making DailyProof childish.

---

# AI as emotional design

The Assistant can use real context for human-feeling feedback.

Avoid generic motivation.

Better example:

> You cleared all three priorities and still finished your ML block after work. That's your strongest completion day this week.

Or:

> Three days in a row. Tomorrow doesn't need to be heroic—just completed.

Tone:
- calm
- specific
- grounded
- contextual
- not over-cheerful
- not patronizing

---

# First impression / onboarding

The first 20–30 seconds should communicate that DailyProof is not just another to-do app.

Potential framing:

```text
DailyProof

Become consistent at the things you say matter.

Plan it.
Do it.
Prove it.
```

The experience should communicate:
- execution
- accountability
- proof
- progress

---

# Accessibility

Premium polish includes accessibility.

Support:
- `prefers-reduced-motion`
- browser zoom
- pinch zoom
- keyboard navigation
- clear focus states
- adequate contrast
- non-color-only state cues

Do not disable browser or pinch zoom.

Final QA should include:
- 125%
- 150%
- 200%

Motion must never block interaction.

---

# Shared component system

Build reusable components before page-specific one-offs.

Suggested components:

```text
AppHeader
BottomNavigation
DesktopSidebar
PageTitle
SectionHeader
Button
IconButton
SegmentedControl
TaskRow
HabitCard
HabitListRow
ProgressRing
Stat
Avatar
Badge
TextInput
SearchField
Composer
MessageBubble
PlanProposal
ProofThumbnail
FriendRow
SettingsRow
Sheet
Modal
Toast
LoadingMark
CelebrationMoment
```

---

# P3 implementation sequence

## Phase A — Foundation

- [ ] Design tokens
- [ ] Dark/light theme
- [ ] Typography
- [ ] Spacing
- [ ] Radii
- [ ] Icon system
- [ ] Motion tokens
- [ ] Reduced-motion support

## Phase B — Shared shell

- [ ] Mobile header
- [ ] Bottom navigation
- [ ] Notification bell
- [ ] More sheet
- [ ] Desktop sidebar
- [ ] Safe-area behavior

## Phase C — Shared components

- [ ] Buttons
- [ ] Inputs
- [ ] Rows
- [ ] Cards
- [ ] Sheets/modals
- [ ] Badges
- [ ] Progress components
- [ ] Loading/error/empty states

## Phase D — Mobile pages

- [ ] Home
- [ ] To-Dos
- [ ] Calendar
- [ ] Assistant
- [ ] Proof
- [ ] Friends
- [ ] More/Settings
- [ ] Notification inbox

## Phase E — Emotional design

- [ ] Button feedback
- [ ] Progress feedback
- [ ] Streak motion
- [ ] Small-win states
- [ ] Milestone states
- [ ] Proof completion feedback
- [ ] Branded loading
- [ ] AI thinking state
- [ ] Reduced-motion equivalents

## Phase F — Desktop

- [ ] Adapt mobile components
- [ ] Persistent sidebar
- [ ] Wider layouts
- [ ] Desktop Calendar
- [ ] Desktop Assistant

## Phase G — Final UI QA

- [ ] 375px
- [ ] 390px
- [ ] 430px
- [ ] Tablet
- [ ] Desktop
- [ ] Dark mode
- [ ] Light mode
- [ ] 125% zoom
- [ ] 150% zoom
- [ ] 200% zoom
- [ ] Reduced motion
- [ ] Slow network
- [ ] Failed reads
- [ ] Repeat navigation
- [ ] Background refresh
- [ ] Real iPhone/PWA
- [ ] Two-user privacy/friend flows
- [ ] AI plan flows
- [ ] Proof lifecycle
- [ ] Reminders/push

---

# Decision log

Add important decisions here so they do not get lost.

| Date | Decision | Reason | Status |
|---|---|---|---|
| 2026-09-16 | Mobile-first design | Forces hierarchy and suits frequent DailyProof usage | Locked |
| 2026-09-16 | Mobile bottom nav: Home / To-Dos / Calendar / Assistant / More | Keeps primary actions thumb-reachable | Locked |
| 2026-09-16 | Desktop uses persistent left sidebar | Better use of horizontal space | Locked |
| 2026-09-16 | Support System / Light / Dark themes | Consumer-grade theme behavior | Locked |
| 2026-09-16 | Habits support Grid + List; tasks remain primarily List | Matches information density of each type | Locked |
| 2026-09-16 | Figma becomes visual source of truth | Prevents design drift in implementation | Locked |
| 2026-09-16 | Emotional design becomes part of P3 system | Product should feel human, not merely functional | Locked |
| 2026-09-16 | Explore abstract DailyProof companion before full mascot | Adds personality with lower childishness risk | Explore |
