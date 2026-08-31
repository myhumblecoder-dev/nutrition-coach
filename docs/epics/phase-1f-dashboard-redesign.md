# Phase 1f — the dashboard redesign

Implements the approved mockups (`docs/design/` canvas, 2026-08-31): the
conversation-is-the-only-input dashboard with rings, dot-grids, bars,
sparkline, receipts feed and coach strip. Font fix (PR #144) ships separately.
Trends page is deliberately deferred to a later phase — the nav ships without
it until it exists.

**Design tokens (from the mockups — use these literal values):**
page bg `#fafafa`; card bg `#ffffff` border `#e4e4e7` radius `14px`; inner
rows border `#f0f0f1` radius `10px`; ink `#18181b`; secondary `#52525b`;
muted `#71717a`; faint `#a1a1aa`; track `#f0f0f1`; accent `#059669`; accent
dark `#047857`; accent wash `#ecfdf5` border `#a7f3d0`; thumb gradient
`linear-gradient(135deg, #d1fae5, #a7f3d0)`.

**Verified facts (from the tree, not assumed):**
- `src/lib/extraction.ts` exports `buildExtractionPrompt`, `parseHealthFacts`,
  `recordHealthFacts(userId, facts)`, `extractHealthFacts(userId, userText)`.
  `recordHealthFacts` creates rows in mealEntry / trainingEntry /
  recoveryEntry / moodEntry / measurement with `source: 'extracted'`.
- `src/lib/time.ts` exports `startOfToday` and `startOfWeek` (Monday, app tz).
- `src/app/actions/getWeek.ts` exports `getWeek()` returning
  `{ training: { resistance, hiit, core, stepsToday }, recovery, mood,
  measurement }` (counts only — no per-day resolution yet).
- `src/components/TrainingCard.tsx` / `RecoveryCard.tsx` /
  `TodayDashboard.tsx` default-export `'use client'` components (phase-1e
  text-row versions, to be redesigned in place).
- `src/components/NavBar.tsx` default-exports a server component with three
  `next/link` Links; `src/app/layout.tsx` renders it above `{children}`.
- `src/components/MealPhotoUpload.tsx` default-exports the file-input
  uploader with label `Photograph a meal`; `HomeClient` composes upload →
  confirm → dashboard; `src/app/page.tsx` loads `getToday()` + `getWeek()`.
- `getToday()` returns meals with `photoUrl` and `source`; chat-extracted
  meals have `photoUrl: ''`.
- `prisma.chatMessage` holds the coach conversation (`role: 'assistant'`).
- Existing tests: vi.mock module-level, jsdom, cwd = repo root.

---

## Story 1 — Schema: receipts carry their words

**Files to modify:**
- `prisma/schema.prisma`

**Acceptance Criteria:**

- `MealEntry`, `TrainingEntry`, `RecoveryEntry`, `MoodEntry`, and `Measurement` each gain `sourceText String?` — the user's words that produced an extracted row.
- No other changes.

**Testing:** not applicable — schema file; there is no unit under test. CD's schema sync applies it.

---

## Story 2 — Extraction stamps sourceText

**Depends on:** Story 1

**Files to modify:**
- `src/lib/extraction.ts`
- `src/lib/extraction.test.ts`

**Acceptance Criteria:**

- `src/lib/extraction.ts` exports `recordHealthFacts(userId, facts, sourceText?)` (third optional string parameter; other exports unchanged). Every create call in it additionally sets `sourceText: sourceText ?? null`.
- `extractHealthFacts` passes `userText.slice(0, 200)` as the third argument.
- Test changes (existing mocks): the mixed-facts test calls `recordHealthFacts('u1', facts, 'had baozi')` and additionally asserts `arg.data.sourceText` is `'had baozi'`; the orchestrator happy-path test additionally asserts the recovery create's `data.sourceText` equals the user text passed in. Existing tests otherwise stay as they are.

**Testing:**
- Test creates carry the source text
- Test the orchestrator passes the user text through

---

## Story 3 — getActivity action (the receipts feed)

**Depends on:** Story 1

**Files to create:**
- `src/app/actions/getActivity.ts`
- `src/app/actions/getActivity.test.ts`

**Acceptance Criteria:**

- `src/app/actions/getActivity.ts` exports `getActivity()` (SOLE export; let TypeScript infer the return type) and starts with `'use server';`.
- Imports `{ auth }` from `'@/auth'` and `{ prisma }` from `'@/lib/db'`. Auth-first: throws `new Error('Unauthorized')` without `session?.user?.id`.
- Fetches the user's 5 most recent rows from each of `mealEntry`, `trainingEntry`, `recoveryEntry`, `moodEntry`, `measurement` (orderBy their timestamp desc). Maps each to `{ id, at, sourceText, source, kind, label, photoUrl }` where: `at` is the row's timestamp; meals → `kind: 'meal'`, `label` = item names joined from parsed `foodItems` (fallback `'Meal'`) + ` · ${totalCalories} kcal · ${totalProtein}g`, `photoUrl` from the row (empty string → null); training → `kind: 'training'`, `label` = the row's kind + (minutes ? ` · ${minutes} min` : '') + (steps ? ` · ${steps} steps` : ''), `photoUrl: null`; recovery → `kind: 'recovery'`, `label` = `${row.kind} ${row.value}`; mood → `kind: 'mood'`, `label` = `mood ${score}/5`; measurement → `kind: 'measurement'`, `label` from present fields (`'172 lb'` / `'34 in waist'` joined ` · `).
- Merges all, sorts by `at` desc, returns the first 8.
- Test setups (mocks exactly: `@/auth` `auth: vi.fn()`, `@/lib/db` with `findMany: vi.fn()` on all five models): unauthorized — rejects `'Unauthorized'`; merge — signed in, mealEntry resolves one row (`foodItems: '[{"name":"Baozi"}]'`, totals 600/25, `photoUrl: ''`, `sourceText: 'had baozi'`, `source: 'extracted'`, `loggedAt: new Date('2026-08-31T13:17:00Z')`), trainingEntry resolves one newer row (`kind: 'neat'`, `minutes: 45`, `loggedAt: new Date('2026-08-31T20:32:00Z')`), others `[]`; assert the return has length 2, the FIRST entry's `kind` is `'training'` with label containing `'45 min'`, and the second's label contains `'Baozi'` and `'600 kcal'`. Write ONLY these tests.

**Testing:**
- Test throws Unauthorized when no session
- Test merges and orders the receipts across tables

---

## Story 4 — getWeek gains day-resolution, streak, and weight history

**Depends on:** Story 1

**Files to modify:**
- `src/app/actions/getWeek.ts`
- `src/app/actions/getWeek.test.ts`

**Acceptance Criteria:**

- `src/app/actions/getWeek.ts` exports `getWeek()` (SOLE export, `'use server'` kept). The return object keeps every existing field and gains: `training.days` — `{ resistance: boolean[], hiit: boolean[], core: boolean[] }`, each an array of 7 booleans Monday→Sunday, true when that kind has an entry on that local day (day index = `Math.floor((entry.loggedAt - startOfWeek(now)) / 86400000)` clamped to 0–6); `streak` — `boolean[]` of 7 entries, oldest→today, true when the user logged at least one meal that local day (query `mealEntry.findMany` with `loggedAt >= startOfToday(now) - 6 days`, bucket by local day using the same arithmetic anchored at `startOfToday(now) - 6 * 86400000`); `weights` — the user's last 30 `measurement` rows having `weightLb` non-null, oldest→newest, mapped to `{ at, weightLb }`.
- Test changes (existing mocks; `measurement` mock gains `findMany: vi.fn()` — keep `findFirst`): use `vi.useFakeTimers()` + `vi.setSystemTime(new Date('2026-01-15T15:00:00.000Z'))` (Thursday Jan 15, EST) for the new tests, `vi.useRealTimers()` in afterEach. Days case — trainingEntry.findMany resolves one `'resistance'` entry at `2026-01-12T15:00:00Z` (Monday) and one at `2026-01-14T15:00:00Z` (Wednesday); assert `training.days.resistance` equals `[true, false, true, false, false, false, false]`. Streak case — mealEntry.findMany resolves meals at Jan 14 and Jan 15 15:00Z; assert `streak` has length 7 with the last two entries `true` and the rest `false`. Existing tests keep passing (they may need the new findMany mocks resolving `[]`).

**Testing:**
- Test training days resolve to weekday booleans
- Test the meal streak buckets the last seven days

---

## Story 5 — RingGauge component

**Files to create:**
- `src/components/RingGauge.tsx`
- `src/components/RingGauge.test.tsx`

**Acceptance Criteria:**

- Default-exports a component named `RingGauge`, marked `'use client'`. Props: `{ value: number; max: number; centerText: string; subText: string; label: string; size?: number }` (`size` defaults to 132).
- Renders the mockup's SVG ring: viewBox `0 0 size size`, radius `size * 0.424` (56 at 132), track circle stroke `#f0f0f1` width `size/12`, progress circle stroke `#059669` same width, `strokeLinecap="round"`, rotated -90°, `strokeDasharray` = `${fraction * circumference} ${circumference - fraction * circumference}` where `fraction = Math.min(1, max > 0 ? value / max : 0)` and `circumference = 2 * Math.PI * radius`; centered `<text>` elements showing `centerText` (bold, `#18181b`) and `subText` (`#71717a`); the `label` below in a 12.5px `#52525b` div.
- Test setups (no mocks): fraction case — `value: 500, max: 2000, centerText: '500', subText: 'of 2,000 kcal', label: 'Calories'`, assert the texts `500`, `of 2,000 kcal`, and `Calories` are in the document, and the progress circle's `stroke-dasharray` starts with a number within 1 of `87.96` (25% of C≈351.86); overflow case — `value: 3000, max: 2000`, assert the dasharray's first number is within 1 of the full circumference (clamped, not overdrawn). Write ONLY these tests.

**Testing:**
- Test renders texts and the proportional arc
- Test clamps overflow at a full ring

---

## Story 6 — TodayDashboard becomes the meals card

**Depends on:** Story 5

**Files to modify:**
- `src/components/TodayDashboard.tsx`
- `src/components/TodayDashboard.test.tsx`

**Acceptance Criteria:**

- The file continues to default-export `TodayDashboard`, marked `'use client'`. The meals prop item type gains `photoUrl?: string` and keeps `source?: string`. Additionally imports `RingGauge` (default) from `'@/components/RingGauge'`.
- Renders per the mockup: the "Daily Progress" card is replaced by a card holding two `RingGauge`s side by side — calories (`value: consumed.calories, max: target?.calories ?? 0, centerText: String(consumed.calories), subText: 'of ' + (target?.calories ?? 0) + ' kcal', label: 'Calories'`) and protein alike; when `target` is null it renders the existing `Set your daily targets` text instead of rings.
- Meal rows restyle to the mockup: a 44px rounded thumbnail — `<img>` with the meal's `photoUrl` when non-empty, else a `#f4f4f5` box; the `mealLabel` name; the `via chat` chip (kept) when `source === 'extracted'`; the calories figure right-aligned. The `DeleteMealButton` and empty state are kept.
- Test changes (existing mocks): rings case — with a 2000/150 target and consumed 1085/62, assert `1085` and `of 2000 kcal` appear; thumbnail case — one meal with `photoUrl: 'https://blob/x.jpg'`, assert an `img` with that src is present. Existing tests updated only where labels moved; behavior assertions kept.

**Testing:**
- Test renders ring gauges from consumed and target
- Test a photo meal renders its thumbnail

---

## Story 7 — TrainingCard becomes the dot-grid

**Depends on:** Story 4

**Files to modify:**
- `src/components/TrainingCard.tsx`
- `src/components/TrainingCard.test.tsx`

**Acceptance Criteria:**

- The file continues to default-export `TrainingCard`, marked `'use client'`. Its props type becomes `{ training: { resistance: number; hiit: number; core: number; stepsToday: number; days: { resistance: boolean[]; hiit: boolean[]; core: boolean[] } } }`.
- Renders the mockup: header `Physical readiness` + muted `this week`; three grid rows (Resistance / HIIT / Core), each a 110px label, seven 22px circles (filled `#059669` when that day is true, `#e4e4e7` when false, and the CURRENT day — index `(new Date().getDay() + 6) % 7` — rendered as a dashed `2px dashed #d4d4d8` outline when false), and a right-aligned `{count} / 3–5` (resistance), `/ 2` (hiit), `/ 3` (core); a weekday footer row M T W T F S S; below a divider, the steps row with a `#f0f0f1` track and `#059669` fill bar at `Math.min(100, stepsToday / 10000 * 100)%` and `{stepsToday.toLocaleString()} / 10,000`.
- Test setups (no mocks): dots case — `days.resistance: [true, false, true, false, false, false, false]` with counts `{ resistance: 2, hiit: 0, core: 0, stepsToday: 6540 }`, assert the text `2 / 3–5` appears and the rendered resistance row contains exactly 2 elements with background `#059669` (query by style or a `data-filled` attribute — render filled dots with `data-filled="true"`); steps case — assert `6,540 / 10,000` appears. Write ONLY these tests.

**Testing:**
- Test renders filled day dots and the cadence count
- Test renders the steps progress figure

---

## Story 8 — RecoveryCard becomes bars, dots, and the weight sparkline

**Depends on:** Story 4

**Files to modify:**
- `src/components/RecoveryCard.tsx`
- `src/components/RecoveryCard.test.tsx`

**Acceptance Criteria:**

- The file continues to default-export `RecoveryCard`, marked `'use client'`. Props gain `weights: Array<{ at: Date | string; weightLb: number }>` (existing props kept).
- Renders the mockup: header `Recovery & mind`; sleep row — label + `{sleepHours}h · target 7–9h` (or `not logged`) and a bar: `#f0f0f1` track with an absolute `#d1fae5` band from 58% to 75% (the 7–9h zone of a 0–12h scale) under a `#059669` fill at `Math.min(100, sleepHours / 12 * 100)%`; water row — bar at `value / 3.8` with `{value}L / 3.8L`; alcohol row — a check icon + `none today` when 0 or null-with-any-logging, else `{n} drinks`; mood row — five 12px dots, `score` filled `#059669`, rest `#e4e4e7`, plus `score/5` and the note; weight block — `{latest} lb` bold with `goal 160 lb` caption and an SVG polyline sparkline of `weights` normalized to the box (stroke `#059669`, width 2, `vector-effect="non-scaling-stroke"`, last point marked with a 4px dot), hidden when `weights.length < 2` (show just the number).
- Test changes (no mocks): filled case — sleep 7.5, water 2.5, alcohol 0, mood `{score: 4}`, measurement `{weightLb: 172, waistIn: null}`, weights of 3 points ending 172; assert `7.5h · target 7–9h`, `4/5`, and `172` appear and an `svg` polyline/path exists; sparse case — all nulls and `weights: []`, assert `not logged` fallbacks appear and no sparkline path is rendered. Write ONLY these tests.

**Testing:**
- Test renders bars mood and the weight sparkline
- Test renders fallbacks without data

---

## Story 9 — RemainingCard (stat tile + streak)

**Depends on:** Story 4

**Files to create:**
- `src/components/RemainingCard.tsx`
- `src/components/RemainingCard.test.tsx`

**Acceptance Criteria:**

- Default-exports a component named `RemainingCard`, marked `'use client'`. Props: `{ remaining: number | null; streak: boolean[] }`.
- Renders the mockup tile: label `Remaining today`; when `remaining` is non-null a 40px bold `{remaining.toLocaleString()}` with a `kcal` suffix and the caption `Deficit window −300 to −500`; when null, the text `Set your daily targets`; below, a `{n} of {streak.length} days` logging-streak line (`n` = count of true) and one 6px rounded pip per entry (`#059669` true / `#e4e4e7` false) in a flex row with 4px gap.
- Test setups (no mocks): filled — `remaining: 915, streak: [true,true,false,true,true,true,false]`, assert `915` and `5 of 7 days` appear; no-target — `remaining: null`, assert `Set your daily targets` appears. Write ONLY these tests.

**Testing:**
- Test renders the remaining figure and streak pips
- Test renders the no-target fallback

---

## Story 10 — CoachStrip component

**Files to create:**
- `src/components/CoachStrip.tsx`
- `src/components/CoachStrip.test.tsx`

**Acceptance Criteria:**

- Default-exports a component named `CoachStrip`, marked `'use client'`. Props: `{ message: string | null }`. Imports `Link` (default) from `'next/link'`.
- When `message` is null renders nothing (`return null`). Otherwise renders the mockup strip: `#ecfdf5` background, `#a7f3d0` border, radius 14px; a 36px `#059669` rounded square with a white chat SVG icon; the message text (`#065f46`, truncated with CSS `display: -webkit-box` 2-line clamp); a `Link` to `/chat` with text `Open chat`.
- Test setups (no mocks): message case — a message string, assert its text and an anchor with `href="/chat"` are present; empty case — `message: null`, assert the container renders nothing (query for the text `Open chat` is absent). Write ONLY these tests.

**Testing:**
- Test renders the message and chat link
- Test renders nothing without a message

---

## Story 11 — ActivityFeed component (receipts)

**Files to create:**
- `src/components/ActivityFeed.tsx`
- `src/components/ActivityFeed.test.tsx`

**Acceptance Criteria:**

- Default-exports a component named `ActivityFeed`, marked `'use client'`. Props: `{ items: Array<{ id: string; at: Date | string; sourceText: string | null; source: string; kind: string; label: string; photoUrl: string | null }> }`.
- Renders the mockup's receipts: a `From your conversation` heading, then one card per item (white, `#e4e4e7` border, radius 12px): when `sourceText` is present, an italic muted line `"{sourceText}"`; when `photoUrl` is present, a 40px thumbnail `<img>`; then a row with a small `#047857` check SVG, `Logged:` bold + the `label`, and the time right-aligned (`new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })`).
- When `items` is empty renders the muted text `Tell the coach about your day — meals, training, sleep — and it lands here.`
- Test setups (no mocks): receipts case — two items, one with `sourceText: 'went for a walk'` and label `neat · 45 min`, one with `photoUrl: 'https://blob/x.jpg'` and label containing `salmon`; assert the quoted text, the label `neat · 45 min`, and an img with the photo src are present; empty case — `items: []`, assert the empty-state text appears. Write ONLY these tests.

**Testing:**
- Test renders quoted receipts and photo thumbnails
- Test renders the empty state

---

## Story 12 — MealPhotoUpload becomes the Log-a-meal button

**Files to modify:**
- `src/components/MealPhotoUpload.tsx`
- `src/components/MealPhotoUpload.test.tsx`

**Acceptance Criteria:**

- The file continues to default-export `MealPhotoUpload`, marked `'use client'`, with unchanged props, imports, handler logic, error and busy behavior.
- The visible control becomes the mockup's primary button: the `<label htmlFor="meal-photo">` is restyled as a `#059669` rounded (10px) white-text button containing a camera SVG icon and the text `Log a meal` (busy state: text `Analyzing…` and reduced opacity); the `<input id="meal-photo">` keeps its accessibility (it remains in the DOM, visually hidden with the Tailwind `sr-only` class, keeping `accept`, `capture`, `disabled`, and `onChange` exactly as they are).
- Test changes (existing mocks): existing tests keep passing — they fire `change` on the labeled input, which still works via `sr-only`; new assertion in the happy-path test: the text `Log a meal` is in the document.

**Testing:**
- Test the control renders as the log a meal button

---

## Story 13 — NavBar becomes the top bar

**Files to modify:**
- `src/components/NavBar.tsx`
- `src/components/NavBar.test.tsx`

**Acceptance Criteria:**

- The file continues to default-export `NavBar` (server component) importing `Link` (default) from `'next/link'`.
- Renders the mockup top bar: white background, `#e4e4e7` bottom border, 64px height, horizontal padding 40px; left — a 26px `#059669` rounded-8px square holding a white leaf-fork SVG mark beside the wordmark `Nutrition Coach` (600 weight); then the links `Today` → `/`, `Targets` → `/targets`, `Chat` → `/chat`; right — the current date via `new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: process.env.APP_TIMEZONE ?? 'America/New_York' }).format(new Date())` in muted 13px.
- Test changes (no mocks): links case — assert links named `Today`, `Targets`, `Chat` point at `/`, `/targets`, `/chat` (replaces the `Home` assertion); wordmark case — assert `Nutrition Coach` appears.

**Testing:**
- Test renders the three nav links
- Test renders the wordmark

---

## Story 14 — Page background and container

**Files to modify:**
- `src/app/layout.tsx`
- `src/app/layout.test.tsx`

**Acceptance Criteria:**

- `src/app/layout.tsx` continues to default-export `RootLayout`; `metadata` remains a named export. Its `<body>` className gains `bg-[#fafafa] text-[#18181b]` (kept: `min-h-full flex flex-col`). Nothing else changes (`NavBar`, fonts, metadata as they are).
- `src/app/layout.test.tsx` (existing — `next/font/google` and `@/components/NavBar` already mocked there) adds one test: render `<RootLayout><p>child</p></RootLayout>`, then `const body = container.querySelector('body')` and assert `body?.className` contains `bg-[#fafafa]` (the jsdom nesting warning about `<html>` is acceptable, as established). Existing tests stay as they are.

**Testing:**
- Test the body carries the page background class

---

## Story 15 — HomeClient assembles the mockup grid

**Depends on:** Story 6, Story 7, Story 8, Story 9, Story 10, Story 11, Story 12

**Files to modify:**
- `src/app/HomeClient.tsx`
- `src/app/HomeClient.test.tsx`

**Acceptance Criteria:**

- The file continues to default-export `HomeClient`, marked `'use client'`. Props gain `activity` (the `getActivity` item array), `coachMessage: string | null`, and within `week`: `training.days`, `streak: boolean[]`, `weights` (pass-throughs; type them as the components expect). Additionally imports `RemainingCard`, `CoachStrip`, `ActivityFeed` (defaults).
- Layout per the mockup, responsive: a header row with the `Today` title, a subtitle line `${today.consumed.calories} kcal in` + (when a target exists) `, ${Math.max(0, (today.target?.protein ?? 0) - today.consumed.protein)}g protein to go`, and `MealPhotoUpload` right-aligned; then a 12-column grid (`grid grid-cols-1 lg:grid-cols-12 gap-5`): meals card (`lg:col-span-8`), `RemainingCard` (`lg:col-span-4`, `remaining` = target ? target.calories − consumed.calories : null), `TrainingCard` (`lg:col-span-7`), `RecoveryCard` (`lg:col-span-5`), `CoachStrip` (`lg:col-span-12`), `ActivityFeed` (`lg:col-span-12`). The pending-analysis `MealConfirmCard` flow is kept above the grid.
- Test changes (mocks: add `@/components/RemainingCard`, `@/components/CoachStrip`, `@/components/ActivityFeed` default-export stubs with testids `remaining-card` / `coach-strip` / `activity-feed`; fixtures gain `activity: []`, `coachMessage: null`, and the extended `week`): assembly case — assert the three new testids are present alongside the existing training/recovery card stubs. Existing tests keep passing with extended fixtures.

**Testing:**
- Test assembles the redesigned grid

---

## Story 16 — Home page loads activity and the coach line

**Depends on:** Story 3, Story 15

**Files to modify:**
- `src/app/page.tsx`
- `src/app/page.test.tsx`

**Acceptance Criteria:**

- `src/app/page.tsx` keeps `export const dynamic = 'force-dynamic'` and its default export. Additionally imports `{ getActivity }` from `'@/app/actions/getActivity'` and `{ prisma }` from `'@/lib/db'`. The signed-in branch becomes `const [today, week, activity, lastCoach] = await Promise.all([getToday(), getWeek(), getActivity(), prisma.chatMessage.findFirst({ where: { userId: session.user.id, role: 'assistant' }, orderBy: { createdAt: 'desc' } })])` and passes `activity={activity}` and `coachMessage={lastCoach?.content ?? null}` to `HomeClient`. The signed-out branch is unchanged and calls none of them.
- Test changes (add mocks `@/app/actions/getActivity` (`getActivity: vi.fn()` resolving `[]`) and `@/lib/db` (`prisma: { chatMessage: { findFirst: vi.fn() } }` resolving null); component stubs as in Story 15): signed-in — assert `getActivity` was called; signed-out — assert it was not.

**Testing:**
- Test the signed-in page loads the activity feed
- Test the signed-out page does not

---

## Ops / follow-ups (not stories)

- Merge PR #144 (font fix) before or with this train.
- Deferred to a later phase: the Trends page (weight line, weekly training
  bars, sleep consistency — the data accumulates meanwhile); phone bottom
  tab bar (the responsive stack covers mobile for now); NEAT minutes shown
  in the steps row.
