# Phase 1b — the app you can actually open

Phase 1 built a tested engine with no interface: four server actions, a schema,
a cron — and `src/app/page.tsx` is still create-next-app's landing page. This
phase puts the nutrition slice on screen, end to end, so the loop from the
infographic works: photograph a meal → confirm the estimate → see today against
your deficit and protein targets.

Stories are sliced so each one ends with something visible or usable, not by
layer. Every story consumes contracts that already exist and are tested.

**Verified facts for every story below (from the tree, not assumed):**
- `analyzeMeal(photoUrl: string)` returns `{ foodItems: Array<{name, portion, calories, protein}>, totalCalories: number, totalProtein: number }` — zod-validated; throws `Error('Vision API returned invalid JSON structure')` on bad model output.
- `saveMealEntry(input: { photoUrl, foodItems, totalCalories, totalProtein })` returns `{ id: string }`.
- `upsertDailyTarget(input: { calories: number; protein: number })` — throws `Error('Unauthorized')` with no session.
- `sendChatMessage(userText: string)` — throws `Error('Unauthorized')` with no session.
- Auth is Auth.js with the GitHub provider; `auth()` from `@/auth`. Session gating lives in `src/proxy.ts` (this Next renames middleware → proxy).
- `prisma` is the export of `@/lib/db` (there is no `db` export).
- Models: `MealEntry { id, userId, photoUrl, foodItems, totalCalories, totalProtein, confirmed, loggedAt }`, `DailyTarget { id, userId, calories, protein }` (one per user, `userId` is `@unique`), `ChatMessage`.
- shadcn/ui IS installed (`src/components/ui/`). Tailwind is available.
- `@vercel/blob` is NOT installed yet — Story 1 adds it.

---

## Story 1 — Photo upload to Vercel Blob

**Depends on:** none

**Files to create:**
- `src/app/actions/uploadMealPhoto.ts`
- `src/app/actions/uploadMealPhoto.test.ts`

**Acceptance Criteria:**

- `uploadMealPhoto(formData: FormData): Promise<{ url: string }>` is the SOLE export of `src/app/actions/uploadMealPhoto.ts`, marked `'use server'`.
- Imports `put` from `@vercel/blob` and `auth` from `@/auth`. `@vercel/blob` must be added to dependencies.
- Throws `new Error('Unauthorized')` when `auth()` returns no `session.user.id`.
- Reads the file from `formData.get('file')`; throws `new Error('No file provided')` when it is absent or not a File.
- Calls `put(<filename>, file, { access: 'public', addRandomSuffix: true })` and returns `{ url: result.url }`.

**Testing:**

Mocks exactly: `@vercel/blob` (`put: vi.fn()`) and `@/auth` (`auth: vi.fn()`).

- Test uploads the file and returns its url: signed-in session, a File in formData, `put` resolves `{ url: 'https://blob/x.jpg' }`; assert the return is `{ url: 'https://blob/x.jpg' }`
- Test rejects when signed out: `auth` resolves null; assert it rejects with `'Unauthorized'` and `put` was not called
- Test rejects when no file is present: signed-in, empty formData; assert it rejects with `'No file provided'`

---

## Story 2 — Read today's meals and target

**Depends on:** none

**Files to create:**
- `src/app/actions/getToday.ts`
- `src/app/actions/getToday.test.ts`

**Acceptance Criteria:**

- `getToday(): Promise<{ meals: Array<{ id: string; foodItems: string; totalCalories: number; totalProtein: number; photoUrl: string; loggedAt: Date }>; target: { calories: number; protein: number } | null; consumed: { calories: number; protein: number } }>` is the SOLE export of `src/app/actions/getToday.ts`, marked `'use server'`.
- Imports `prisma` from `@/lib/db` and `auth` from `@/auth`.
- Throws `new Error('Unauthorized')` when `auth()` returns no `session.user.id`.
- Queries `prisma.mealEntry.findMany({ where: { userId, loggedAt: { gte: <UTC midnight today> } }, orderBy: { loggedAt: 'desc' } })` and `prisma.dailyTarget.findUnique({ where: { userId } })`.
- `consumed` sums `totalCalories` and `totalProtein` across the returned meals; both are `0` when there are no meals.

**Testing:**

Mocks exactly: `@/lib/db` (`prisma: { mealEntry: { findMany: vi.fn() }, dailyTarget: { findUnique: vi.fn() } }`) and `@/auth` (`auth: vi.fn()`).

- Test sums calories and protein across today's meals: findMany resolves two meals (300/20 and 500/40); assert `consumed` is `{ calories: 800, protein: 60 }`
- Test returns zeroes and a null target for a new user: findMany resolves `[]`, findUnique resolves null; assert `consumed` is `{ calories: 0, protein: 0 }` and `target` is null
- Test rejects when signed out: `auth` resolves null; assert it rejects with `'Unauthorized'`

---

## Story 3 — MealPhotoUpload component

**Depends on:** Story 1

**Files to create:**
- `src/components/MealPhotoUpload.tsx`
- `src/components/MealPhotoUpload.test.tsx`

**Acceptance Criteria:**

- Default-exports a component named `MealPhotoUpload`, marked `'use client'`.
- Props: `{ onAnalyzed: (result: { photoUrl: string; foodItems: Array<{ name: string; portion: string; calories: number; protein: number }>; totalCalories: number; totalProtein: number }) => void }`.
- Imports `uploadMealPhoto` from `@/app/actions/uploadMealPhoto` and `analyzeMeal` from `@/app/actions/analyzeMeal`.
- Renders `<input type="file" accept="image/*" capture="environment" />` (so a phone opens the camera) with an accessible label `Photograph a meal`.
- On file selection: builds a FormData with key `file`, calls `uploadMealPhoto`, then `analyzeMeal(url)`, then calls `onAnalyzed` with the analysis plus `photoUrl`.
- While either call is in flight, renders the text `Analyzing…` and the file input is `disabled`.
- On a thrown error, renders the message text in a `<p>` with className containing `text-red-500`, and does not call `onAnalyzed`.

**Testing:**

Mocks exactly: `@/app/actions/uploadMealPhoto`, `@/app/actions/analyzeMeal`.

- Test uploads then analyses and reports the result: both actions resolve; fire a change event with a File; assert `onAnalyzed` was called with an object whose `photoUrl` is the uploaded url
- Test shows an error and does not report: `analyzeMeal` rejects with `'Vision API returned invalid JSON structure'`; assert that text appears and `onAnalyzed` was not called

---

## Story 4 — MealConfirmCard component

**Depends on:** none

**Files to create:**
- `src/components/MealConfirmCard.tsx`
- `src/components/MealConfirmCard.test.tsx`

**Acceptance Criteria:**

- Default-exports a component named `MealConfirmCard`, marked `'use client'`.
- Props: `{ analysis: { photoUrl: string; foodItems: Array<{ name: string; portion: string; calories: number; protein: number }>; totalCalories: number; totalProtein: number }; onSaved: () => void; onCancel: () => void }`.
- Imports `saveMealEntry` from `@/app/actions/saveMealEntry`.
- Renders each food item's name and portion, and number inputs for total calories and total protein pre-filled from the analysis — the estimate is ALWAYS editable before it is logged; a model number is never saved silently.
- A `Log meal` button calls `saveMealEntry` with the (possibly edited) totals and the original `photoUrl` and `foodItems`, then calls `onSaved`.
- A `Cancel` button calls `onCancel` and does not call `saveMealEntry`.

**Testing:**

Mocks exactly: `@/app/actions/saveMealEntry`.

- Test logs the edited totals: change the calories input to 450, click `Log meal`; assert `saveMealEntry` was called with an object containing `totalCalories: 450`
- Test cancel does not save: click `Cancel`; assert `onCancel` was called and `saveMealEntry` was not
- Test renders each food item name: assert both item names from a two-item analysis appear

---

## Story 5 — TodayDashboard component

**Depends on:** none

**Files to create:**
- `src/components/TodayDashboard.tsx`
- `src/components/TodayDashboard.test.tsx`

**Acceptance Criteria:**

- Default-exports a component named `TodayDashboard`, marked `'use client'`.
- Props: `{ consumed: { calories: number; protein: number }; target: { calories: number; protein: number } | null; meals: Array<{ id: string; foodItems: string; totalCalories: number; totalProtein: number }> }`.
- Renders `<consumed.calories> / <target.calories> cal` and `<consumed.protein> / <target.protein> g protein` when a target exists.
- When `target` is null, renders the text `Set your daily targets` instead of the ratios.
- Renders one row per meal showing its calories and protein.
- When `meals` is empty, renders the text `No meals logged today`.

**Testing:**

No mocks — a pure presentational component driven by props.

- Test shows consumed against target: consumed 800/60, target 2000/150; assert the text `800 / 2000 cal` appears
- Test prompts when no target is set: target null; assert `Set your daily targets` appears
- Test shows the empty state: meals `[]`; assert `No meals logged today` appears

---

## Story 6 — HomeClient: the meal loop wiring

**Depends on:** Story 3, Story 4, Story 5

**Files to create:**
- `src/app/HomeClient.tsx`
- `src/app/HomeClient.test.tsx`

**Acceptance Criteria:**

- Default-exports a component named `HomeClient`, marked `'use client'`.
- Props: `{ today: { meals: Array<{ id: string; foodItems: string; totalCalories: number; totalProtein: number }>; target: { calories: number; protein: number } | null; consumed: { calories: number; protein: number } } }`.
- Imports (default exports): `MealPhotoUpload` from `@/components/MealPhotoUpload`, `MealConfirmCard` from `@/components/MealConfirmCard`, `TodayDashboard` from `@/components/TodayDashboard`; plus `useRouter` from `next/navigation`.
- Renders `MealPhotoUpload` above `TodayDashboard`, passing `consumed`, `target` and `meals` straight through from `today`.
- Holds the pending analysis in `useState`; when `MealPhotoUpload` calls `onAnalyzed` it renders `MealConfirmCard` for that analysis.
- `MealConfirmCard`'s `onSaved` clears the pending analysis and calls `router.refresh()`; `onCancel` clears it without refreshing.

**Testing:**

Mocks exactly: `next/navigation` (`useRouter: () => ({ refresh: vi.fn() })`), `@/app/actions/uploadMealPhoto`, `@/app/actions/analyzeMeal`, `@/app/actions/saveMealEntry`.

- Test renders the dashboard from props: consumed 800/60 against a 2000/150 target; assert the text `800 / 2000 cal` appears
- Test shows the confirm card after an analysis: fire the file input's change event with both actions resolving; assert a `Log meal` button appears

---

## Story 7 — Home page renders the signed-in app

**Depends on:** Story 2, Story 6

**Files to modify:**
- `src/app/page.tsx`

**Acceptance Criteria:**

- `src/app/page.tsx` default-exports `async function Home()` and also `export const dynamic = 'force-dynamic'` (it reads the session and the database per request).
- Imports `auth` from `@/auth`, `getToday` from `@/app/actions/getToday`, and `HomeClient` (default) from `./HomeClient`.
- With no session, renders a sign-in prompt containing the text `Sign in to start logging` and does NOT call `getToday`.
- With a session, calls `getToday()` and renders `<HomeClient today={...} />`.
- create-next-app's placeholder markup (the Next.js logo and starter links) is removed entirely.

**Testing:**

Mocks exactly: `@/auth` (`auth: vi.fn()`), `@/app/actions/getToday` (`getToday: vi.fn()`), and `./HomeClient` is NOT mocked — its own child actions are: `@/app/actions/uploadMealPhoto`, `@/app/actions/analyzeMeal`, `@/app/actions/saveMealEntry`, plus `next/navigation`.

- Test prompts a signed-out visitor: `auth` resolves null; render `await Home()`; assert `Sign in to start logging` appears and `getToday` was not called
- Test renders the app for a signed-in user: `auth` resolves a user, `getToday` resolves consumed 0/0 with no target and no meals; assert `No meals logged today` appears

---

## Story 8 — DailyTargetForm component

**Depends on:** none

**Files to create:**
- `src/components/DailyTargetForm.tsx`
- `src/components/DailyTargetForm.test.tsx`

**Acceptance Criteria:**

- Default-exports a component named `DailyTargetForm`, marked `'use client'`.
- Props: `{ initial: { calories: number; protein: number } | null }`.
- Imports `upsertDailyTarget` from `@/app/actions/upsertDailyTarget` and `useRouter` from `next/navigation`.
- Renders number inputs labelled `Daily calories` and `Daily protein (g)`, pre-filled from `initial` when it is not null.
- A `Save targets` button calls `upsertDailyTarget({ calories, protein })` with the entered numbers, then calls `router.refresh()`, then renders the text `Targets saved`.

**Testing:**

Mocks exactly: `@/app/actions/upsertDailyTarget`, `next/navigation`.

- Test saves the entered targets: type 2000 and 150, click `Save targets`; assert `upsertDailyTarget` was called with `{ calories: 2000, protein: 150 }`
- Test shows confirmation after saving: the action resolves; assert `Targets saved` appears

---

## Story 9 — Targets page

**Depends on:** Story 8

**Files to create:**
- `src/app/targets/page.tsx`

**Acceptance Criteria:**

- `src/app/targets/page.tsx` default-exports `async function TargetsPage()` and also `export const dynamic = 'force-dynamic'`.
- Imports `auth` from `@/auth`, `prisma` from `@/lib/db`, and `DailyTargetForm` (default) from `@/components/DailyTargetForm`.
- With no session, renders the text `Sign in to set targets` and does NOT query the database.
- With a session, reads `prisma.dailyTarget.findUnique({ where: { userId: session.user.id } })` and renders `<DailyTargetForm initial={...} />`, passing null when no row exists.

**Testing:**

Mocks exactly: `@/auth` (`auth: vi.fn()`), `@/lib/db` (`prisma: { dailyTarget: { findUnique: vi.fn() } }`), `@/app/actions/upsertDailyTarget`, `next/navigation`.

- Test prompts a signed-out visitor: `auth` resolves null; assert `Sign in to set targets` appears and `findUnique` was not called
- Test renders the form with the saved target: findUnique resolves `{ calories: 2000, protein: 150 }`; assert an input with value `2000` is present
