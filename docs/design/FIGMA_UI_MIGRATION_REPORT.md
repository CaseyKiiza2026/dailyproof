# DailyProof Figma UI migration

Branch: `ui/figma-migration`. The working tree was clean before this work. No existing user changes were discarded. No deployment or production data mutations were performed.

## Design sources

The connected Figma tools successfully accessed the populated [DailyProof file](https://www.figma.com/design/Usxcj29nuYitvALlfZH1FS/DailyProof?node-id=1-12). Desktop, Mobile Shell, Light Mode, Foundations, Components, Motion, and the individual feature pages contain design content.

Inspected desktop dark/light pairs: Home `213:3` / `218:438`; To-Dos `213:67` / `218:619`; Calendar `213:131` / `218:704`; Assistant `213:195` / `218:828`; Proof `213:259` / `218:899`; Friends `213:323` / `218:981`; More `213:387` / `218:1076`.

Inspected Mobile Shell frames: `249:481`, `249:696`, `249:752`, `249:870`, `249:909`, `249:967`, `249:1014`, `249:1038`, `249:1083`, `249:1127`, `249:1140`. Mobile light references: `195:49`, `195:311`, `195:440`, `195:655`, `195:772`, `195:897`, `195:978`. Foundations, components, and motion informed the shared styles. The six shield paths are exported Figma geometry, not substitute artwork.

## File impact map

| File | Purpose |
| --- | --- |
| `app/globals.css` | Neutral dark/light semantic surfaces, self-hosted Manrope, shared controls, layout, responsive spacing, calendar theme, focus and reduced motion. |
| `tailwind.config.ts` | Map existing color classes onto theme-aware semantic values; remove the green surface cast. |
| `app/layout.tsx` | Restore the locally selected appearance before hydration. Existing preferences/auth seed remains intact. |
| `components/ui/theme-toggle.tsx` | Real appearance control with local persistence. |
| `components/ui/progress-shield.tsx` | Exact six-segment Figma shield showing existing completion results. |
| `components/ui/logo.tsx` | Shared shield and two-tone wordmark. |
| `components/ui/modal.tsx` | Consistent dialog surface, Escape, focus containment/return, scroll lock, and stacking above mobile navigation. |
| `components/layout/app-shell.tsx` | Desktop sidebar, five-item mobile navigation, theme control, and one-time session launch animation. Retains logout and existing providers. |
| `app/(app)/dashboard/page.tsx` | Focus Home on progress, focus tasks, weekly overview, and habits. |
| `components/dashboard/progress-overview.tsx` | Present existing daily/period progress utilities and task actions; retain extra statistics in disclosure. |
| `components/dashboard/habit-grid.tsx` | Spacious desktop week view, retained month history, clearer state symbols and reduced decoration. |
| `components/dashboard/mobile-habit-list.tsx` | Theme-aware mobile surfaces and reduced filler. |
| `components/dashboard/habit-form-modal.tsx` | Theme-aware form surface. |
| `components/dashboard/habit-row-menu.tsx` | Theme-aware menu surface. |
| `components/tasks/task-board.tsx` | Responsive task grouping and existing task editor inside the shared modal. |
| `components/calendar/calendar-board.tsx` | Existing editor opens from empty timeline slots with local date/time prefilled; theme-aware event appearance. Uses installed FullCalendar 7 APIs. |
| `components/assistant/assistant-panel.tsx` | Conversation and proposal layout around existing generation/apply/discard actions. |
| `components/proofs/proof-panel.tsx` | Shared evidence styling hook and expanded-state accessibility. |
| `app/(app)/friends/page.tsx` | Remove nonfunctional decorative filler; label search. Preserve requests, nudges, history, and removal. |
| `components/friends/friend-row-menu.tsx` | Theme-aware menu surface. |
| `app/(app)/profile/page.tsx` | More navigation, compact real account summary, settings links, and retained privacy controls. Queries unchanged. |
| `public/fonts/manrope.ttf`, `public/fonts/OFL.txt` | Self-hosted variable Manrope and its license. |
| `public/figma/shield-1.svg` through `shield-6.svg` | Original Figma shield exports retained as source assets. |
| `scripts/ui-check.cjs` | Extend the existing real-component interaction harness to both themes and serve the actual font. |
| `scripts/figma-build.cjs` | Extend the isolated visual fixture with Friends and the actual server-rendered More markup. |
| `scripts/figma-check.cjs` | Responsive screenshots, overflow/runtime/font checks, calendar slot prefill, Escape, and appearance storage. |
| `docs/design/FIGMA_UI_MIGRATION_REPORT.md` | Review record and intentional differences. |

Reused: AppShell, Modal, HabitGrid and its menus/forms, MobileHabitList, TaskBoard, CalendarBoard, ProofPanel, AssistantPanel, FriendHistory, PrivacySettings, UserClock, TasksProvider, CalendarProvider, and existing progress/date utilities.

Protected and unchanged: `lib/` hooks/actions/domain logic, Supabase clients and queries, `supabase/` migrations and policies, APIs, authentication, route paths, data models, package manifests/lockfile, and regression test assertions. No dependencies were added.

## Verification

- `npm.cmd run typecheck` — passed.
- `npm.cmd run lint` — passed; one existing `postcss.config.mjs` anonymous-default-export warning.
- `node --test tests/*.test.mjs` — 178 passed, zero failures.
- `node node_modules/next/dist/bin/next build` — passed.
- `node scripts/ui-build.cjs`, then `node scripts/ui-check.cjs` — 40 route/viewport/theme interaction checks passed at 375, 390, 430, and 1280px. Covers Home, To-Dos, Calendar, Notifications, and Assistant, including real component task/proof/reminder/commitment/apply flows with synthetic transports.
- After the base UI build, `node scripts/figma-build.cjs`, then `node scripts/figma-check.cjs` — 36 route/viewport/theme visual checks at 375, 768, and 1440px for Home, To-Dos, Calendar, Assistant, Friends, and More. Both themes, actual font loading, no page overflow/runtime errors, noon-to-13:00 editor prefill, Escape dismissal, and appearance storage.

Run the two browser harnesses sequentially: they intentionally share the ignored `out/mobile-check` build directory. Screenshots are saved there as `integration-{route}-{width}-{theme}.png` and `figma-{route}-{width}-{theme}.png`. Regression output is in `out/figma-regression.log`.

Manual screenshot review caught and corrected mobile shield text crowding, card spacing, and FullCalendar 7 palette variables. The calendar now uses the same semantic surfaces as the rest of the application. Reduced-motion styles disable decorative animations; launch does not block controls and runs once per session, not on navigation or resume.

The regression suite covers existing auth, privacy, CRUD, stale-response/refresh behavior, habit semantics, proof, assistant, reminders, and friend flows using isolated test infrastructure. These results are not a claim that a live Supabase account, production AI provider, email, or push delivery was exercised. More screenshots use server-rendered synthetic data; interactive privacy behavior is covered separately by the existing regression suite.

## Intentional differences and protected limitations

- There is no standalone Proof route or aggregate proof-library query in the existing app. Evidence remains attached to completed habits/tasks through the working ProofPanel. No dead Proof navigation entry or fake gallery was added.
- Existing assistant proposal/apply/discard behavior remains. Mockup undo/edit capabilities absent from the existing implementation were not invented.
- More contains working profile statistics, privacy controls, and existing route links. Mockup security, export, profile editing, and week-start controls without existing actions were not added.
- Mobile habit history retains its scrollable grid and list alternative with 44px interactive cells, rather than compressing every day into smaller targets. Desktop defaults to a week slice of the selected month; month history remains accessible. Month-boundary weeks reflect the selected month's available dates.
- Calendar retains the working day/week/month engine and secondary commitment/habit-time editors. It is not a pixel-identical replacement calendar or mini-calendar. All existing edit/delete and refresh behavior remains.
- Task buckets, actual task descriptions/dates, friend privacy summaries/history, and evidence actions remain visible even where the static mockups omit them. The application does not substitute mockup sample claims or invented data.
- Complete, missed, rest, vacation, empty, and unscheduled habit states retain their distinct meanings. Existing percentage eligibility rules are unchanged; neutral days may appear in displayed totals without counting toward the completion denominator.
- No milestone trigger or new success business event was added solely to animate it. Existing completion transitions use restrained motion; there are no looping particles or audio.

The result applies the approved design system around the existing product. It is not a claim of pixel identity for functionality that differs from the mockups.
