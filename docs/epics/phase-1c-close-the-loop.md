# Phase 1c — close the loop

Phase 1b put the nutrition slice on screen, but an e2e run (2026-08-30) proved the
product cannot complete its core loop for any real user:

- Four of six action files are missing the `'use server'` directive, so client
  components bundle them into the browser: photo analysis runs in the visitor's
  browser (hitting `localhost:11434`), and saves construct PrismaClient in the
  browser, which throws. Verified in `.next/static/chunks/` of a production build.
- There is no way to sign in or out (no button anywhere; prod OAuth also had
  `client_id=undefined` from a stale deploy — ops issue, not a story).
- The daily cron sends to `api.telegram.org/botundefined/...`, ignores the
  response, and reports `ok: true`.
- Logged meals render as raw JSON; the day boundary is UTC; the chat check-in
  mode has no UI; there is no nav, no sign-out, no meal delete.

This phase makes the vision from the README actually work end to end. One
implementation unit per story, red-green-refactor, prescriptive AC.

**Verified facts (from the tree, not assumed):**
- `'use server'` is present in `uploadMealPhoto.ts` (no semicolon) and
  `getToday.ts` (with semicolon); absent from `analyzeMeal.ts`,
  `saveMealEntry.ts`, `sendChatMessage.ts`, `upsertDailyTarget.ts`.
- `src/auth.ts` exports `{ handlers, auth, signIn, signOut }` (NextAuth v5,
  GitHub provider, Prisma adapter). All six action modules use NAMED exports.
- `sendChatMessage(userText)` returns `{ assistantReply: string }`.
- `MealEntry.foodItems` is a JSON-encoded string of
  `Array<{name, portion, calories, protein}>`.
- shadcn/ui components live in `src/components/ui/` (Button, Card, Input,
  Label, Badge, Textarea).
- vitest runs with `process.cwd()` = repo root, so meta-tests may read source
  files via `node:fs` + `join(process.cwd(), ...)`.
- `src/app/layout.tsx` calls `Geist` and `Geist_Mono` from `next/font/google`
  at module scope — any test importing the layout must mock `next/font/google`.

---

## Story 1 — 'use server' directive: analyzeMeal

**Files to modify:**
- `src/app/actions/analyzeMeal.ts`
- `src/app/actions/analyzeMeal.test.ts`

**Acceptance Criteria:**

- The new FIRST line of `src/app/actions/analyzeMeal.ts` is exactly `'use server';`, above the existing imports. No other line of the module changes.
- `src/app/actions/analyzeMeal.ts` exports `analyzeMeal` (SOLE export, unchanged) and continues to import `{ analyzePhoto }` from `'@/lib/llm'` and `{ z }` from `'zod'`.
- Why: `MealPhotoUpload` (a client component) imports this module; without the directive it compiles into the browser bundle and the vision call runs in the visitor's browser.
- The new test is added to the existing describe block in `src/app/actions/analyzeMeal.test.ts`, which additionally imports `{ readFileSync }` from `'node:fs'` and `{ join }` from `'node:path'`. The test computes `const firstLine = readFileSync(join(process.cwd(), 'src/app/actions/analyzeMeal.ts'), 'utf8').split('\n')[0]` and asserts `expect(firstLine).toMatch(/^['"]use server['"];?\s*$/)`. Existing mocks and tests stay as they are.

**Testing:**
- Test the module source begins with the use server directive

---

## Story 2 — 'use server' directive: saveMealEntry

**Files to modify:**
- `src/app/actions/saveMealEntry.ts`
- `src/app/actions/saveMealEntry.test.ts`

**Acceptance Criteria:**

- The new FIRST line of `src/app/actions/saveMealEntry.ts` is exactly `'use server';`, above the existing imports. No other line of the module changes.
- `src/app/actions/saveMealEntry.ts` exports `saveMealEntry` (SOLE export, unchanged) and continues to import `{ auth }` from `'@/auth'`, `{ prisma }` from `'@/lib/db'`, and `{ z }` from `'zod'`.
- Why: `MealConfirmCard` (a client component) imports this module; without the directive PrismaClient is constructed in the browser, which throws.
- The new test is added to the existing describe block in `src/app/actions/saveMealEntry.test.ts`, which additionally imports `{ readFileSync }` from `'node:fs'` and `{ join }` from `'node:path'`. The test computes `const firstLine = readFileSync(join(process.cwd(), 'src/app/actions/saveMealEntry.ts'), 'utf8').split('\n')[0]` and asserts `expect(firstLine).toMatch(/^['"]use server['"];?\s*$/)`. Existing mocks and tests stay as they are.

**Testing:**
- Test the module source begins with the use server directive

---

## Story 3 — 'use server' directive: upsertDailyTarget

**Files to modify:**
- `src/app/actions/upsertDailyTarget.ts`
- `src/app/actions/upsertDailyTarget.test.ts`

**Acceptance Criteria:**

- The new FIRST line of `src/app/actions/upsertDailyTarget.ts` is exactly `'use server';`, above the existing imports. No other line of the module changes.
- `src/app/actions/upsertDailyTarget.ts` exports `upsertDailyTarget` (SOLE export, unchanged) and continues to import `{ auth }` from `'@/auth'`, `{ prisma }` from `'@/lib/db'`, and `{ z }` from `'zod'`.
- Why: `DailyTargetForm` (a client component) imports this module; without the directive PrismaClient is constructed in the browser, which throws.
- The new test is added to the existing describe block in `src/app/actions/upsertDailyTarget.test.ts`, which additionally imports `{ readFileSync }` from `'node:fs'` and `{ join }` from `'node:path'`. The test computes `const firstLine = readFileSync(join(process.cwd(), 'src/app/actions/upsertDailyTarget.ts'), 'utf8').split('\n')[0]` and asserts `expect(firstLine).toMatch(/^['"]use server['"];?\s*$/)`. Existing mocks and tests stay as they are.

**Testing:**
- Test the module source begins with the use server directive

---

## Story 4 — 'use server' directive: sendChatMessage

**Files to modify:**
- `src/app/actions/sendChatMessage.ts`
- `src/app/actions/sendChatMessage.test.ts`

**Acceptance Criteria:**

- The new FIRST line of `src/app/actions/sendChatMessage.ts` is exactly `'use server';`, above the existing imports. No other line of the module changes.
- `src/app/actions/sendChatMessage.ts` exports `sendChatMessage` (SOLE export, unchanged) and continues to import `{ auth }` from `'@/auth'`, `{ prisma }` from `'@/lib/db'`, `{ generate }` from `'@/lib/llm'`, and `{ z }` from `'zod'`.
- Why: the upcoming ChatClient (a client component) imports this module; without the directive the LLM call and Prisma writes compile into the browser bundle.
- The new test is added to the existing describe block in `src/app/actions/sendChatMessage.test.ts`, which additionally imports `{ readFileSync }` from `'node:fs'` and `{ join }` from `'node:path'`. The test computes `const firstLine = readFileSync(join(process.cwd(), 'src/app/actions/sendChatMessage.ts'), 'utf8').split('\n')[0]` and asserts `expect(firstLine).toMatch(/^['"]use server['"];?\s*$/)`. Existing mocks and tests stay as they are.

**Testing:**
- Test the module source begins with the use server directive

---

## Story 5 — Directive guard test for all actions

**Depends on:** Story 1, Story 2, Story 3, Story 4

**Files to create:**
- `src/app/actions/serverDirective.test.ts`

**Acceptance Criteria:**

- The test file imports `{ readFileSync }` from `'node:fs'` and `{ join }` from `'node:path'` and NOTHING else — it deliberately does not import the action modules; it reads their source text, so it can never be fooled by mocks. It guards every action file at once so a future action cannot regress silently.
- Defines `const files = ['analyzeMeal.ts', 'getChatHistory.ts', 'getToday.ts', 'saveMealEntry.ts', 'sendChatMessage.ts', 'uploadMealPhoto.ts', 'upsertDailyTarget.ts'].filter((f) => { try { readFileSync(join(process.cwd(), 'src/app/actions', f)); return true } catch { return false } })` — the filter tolerates files from later stories not existing yet.
- The single test loops over `files`; for each it computes `const firstLine = readFileSync(join(process.cwd(), 'src/app/actions', file), 'utf8').split('\n')[0]` and asserts `expect(firstLine).toMatch(/^['"]use server['"];?\s*$/)` — one expect per file, inside the loop.
- Write ONLY this test.

**Testing:**
- Test every server action file begins with the use server directive

---

## Story 6 — Sign in and sign out on the home page

**Files to modify:**
- `src/app/page.tsx`
- `src/app/page.test.tsx`

**Acceptance Criteria:**

- `src/app/page.tsx` continues to default-export `async function Home()` and keeps `export const dynamic = 'force-dynamic'`. Its auth import statement becomes `import { auth, signIn, signOut } from '@/auth'`.
- Signed-out branch: keeps the existing heading and prompt text, and adds below the prompt a form `<form action={async () => { 'use server'; await signIn('github') }}>` containing exactly one `<button type="submit">Sign in with GitHub</button>`.
- Signed-in branch: returns a fragment rendering, ABOVE the existing `<HomeClient today={today} />`, a `<div>` containing `<form action={async () => { 'use server'; await signOut() }}>` with exactly one `<button type="submit">Sign out</button>`.
- `src/app/page.test.tsx`: the `@/auth` mock becomes `vi.mock('@/auth', () => ({ auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }))`; all other existing mocks and tests stay as they are. New test setups: signed-out — `auth` resolves null, assert a button with text `Sign in with GitHub` is in the document; signed-in — `auth` resolves `{ user: { id: 'u1' } }` and `getToday` resolves `{ meals: [], target: null, consumed: { calories: 0, protein: 0 } }`, assert a button with text `Sign out` is in the document.

**Testing:**
- Test a signed-out visitor sees the sign-in button
- Test a signed-in user sees the sign-out button

---

## Story 7 — Real app metadata

**Files to modify:**
- `src/app/layout.tsx`

**Files to create:**
- `src/app/layout.test.tsx`

**Acceptance Criteria:**

- In `src/app/layout.tsx` the exported `metadata` object becomes `{ title: "Nutrition Coach", description: "Photo-first meal logging with AI vision analysis, daily targets, and coach check-ins" }` — replacing the create-next-app placeholder ("Create Next App").
- `src/app/layout.tsx` continues to default-export `RootLayout`; `metadata` remains a named export. Nothing else changes.
- `src/app/layout.test.tsx` mocks `next/font/google` at module level: `vi.mock('next/font/google', () => ({ Geist: () => ({ variable: 'v1' }), Geist_Mono: () => ({ variable: 'v2' }) }))` (the layout calls these at module scope). It imports `{ metadata }` from `'./layout'` and asserts `expect(metadata.title).toBe('Nutrition Coach')`. Write ONLY this test.

**Testing:**
- Test the metadata title is Nutrition Coach

---

## Story 8 — Proxy matcher cleanup

**Files to modify:**
- `src/proxy.ts`
- `src/proxy.test.ts`

**Acceptance Criteria:**

- In `src/proxy.ts` the matcher becomes `['/((?!api|_next/static|_next/image|favicon.ico).*)']` — the `sign-in` carve-out is removed because no `/sign-in` route exists (it 404s today).
- `src/proxy.ts` exports `config` (named, unchanged shape) and continues to import `{ auth }` from `'@/auth'` and re-export it via `export { auth as proxy }`. No other change.
- `src/proxy.test.ts`: keep the existing catch-all test; REPLACE the test asserting the matcher excludes sign-in paths with one asserting `config.matcher[0]` does NOT contain the substring `'sign-in'`. The existing module-level mock of `'@/auth'` stays.

**Testing:**
- Test config matcher string contains the catch-all pattern
- Test config matcher string does not contain sign-in

---

## Story 9 — TodayDashboard: human-readable meal rows

**Files to modify:**
- `src/components/TodayDashboard.tsx`
- `src/components/TodayDashboard.test.tsx`

**Acceptance Criteria:**

- The file continues to default-export the component named `TodayDashboard`, marked `'use client'`, with unchanged props and unchanged ui imports.
- Adds a module-level, non-exported function `mealLabel(foodItems: string): string`: `JSON.parse` the input inside try/catch; when the result is an array with at least one element, return the elements' `name` values joined with `', '`; in every other case (parse throws, not an array, empty array) return the literal string `'Meal'`.
- The meal row's primary `<span>` renders `mealLabel(meal.foodItems)` instead of the raw `meal.foodItems`.
- Test setups (no mocks — presentational): joined-names case — one meal with `foodItems: '[{"name":"Apple","portion":"1 medium","calories":95,"protein":0},{"name":"Rice","portion":"1 cup","calories":200,"protein":4}]'`, assert the text `Apple, Rice` appears; fallback case — one meal with `foodItems: 'not json'`, assert the text `Meal` appears. Existing tests stay as they are.

**Testing:**
- Test renders joined item names for a two item meal
- Test renders the fallback label for unparseable foodItems

---

## Story 10 — MealConfirmCard: inline save error instead of alert()

**Depends on:** Story 2

**Files to modify:**
- `src/components/MealConfirmCard.tsx`
- `src/components/MealConfirmCard.test.tsx`

**Acceptance Criteria:**

- The file continues to default-export the component named `MealConfirmCard`, marked `'use client'`, with unchanged props; it continues to import `{ saveMealEntry }` from `'@/app/actions/saveMealEntry'` and the existing ui components.
- Adds `const [error, setError] = useState<string | null>(null)`. `handleLogMeal` calls `setError(null)` before `saveMealEntry`; the catch branch calls `setError(msg)` instead of `alert(msg)`. After this story the string `alert` appears nowhere in the file.
- Renders `{error && <p className="text-sm text-red-500">{error}</p>}` inside `CardContent`, after the totals block. `onSaved` is still only called on success.
- Test setup (mocks exactly, existing: `@/app/actions/saveMealEntry`): the action rejects with `new Error('Unauthorized')`; click `Log meal`; assert the text `Unauthorized` appears and `onSaved` was not called. Existing tests stay as they are.

**Testing:**
- Test shows a failed save inline and does not report

---

## Story 11 — DailyTargetForm: input guard and error surface

**Depends on:** Story 3

**Files to modify:**
- `src/components/DailyTargetForm.tsx`
- `src/components/DailyTargetForm.test.tsx`

**Acceptance Criteria:**

- The file continues to default-export the component named `DailyTargetForm`, marked `'use client'`, with unchanged props; it continues to import `{ upsertDailyTarget }` from `'@/app/actions/upsertDailyTarget'` and `{ useRouter }` from `'next/navigation'`.
- The `Save targets` button is `disabled` whenever `calories <= 0 || protein <= 0`, and while a save is in flight.
- Adds `const [error, setError] = useState<string | null>(null)`. `handleSave` first calls `setError(null)` and `setSaved(false)`, then wraps the action call in try/catch: on success `setSaved(true)` then `router.refresh()`; on failure `setError(err instanceof Error ? err.message : 'Failed to save targets')` and NO `router.refresh()`.
- Renders `{error && <p className="text-sm text-red-500">{error}</p>}` below the button.
- Test setups (mocks exactly, existing: `@/app/actions/upsertDailyTarget`, `next/navigation`): disabled case — render with `initial` null, assert the `Save targets` button is disabled; rejected case — type 2000 and 150, action rejects with `new Error('Invalid target data')`, click save, assert `Invalid target data` appears and `Targets saved` does not. Existing tests stay as they are (they enter positive values before saving).

**Testing:**
- Test the save button is disabled with empty targets
- Test a rejected save surfaces its message

---

## Story 12 — uploadMealPhoto: accept only supported image types

**Files to modify:**
- `src/app/actions/uploadMealPhoto.ts`
- `src/app/actions/uploadMealPhoto.test.ts`

**Acceptance Criteria:**

- `src/app/actions/uploadMealPhoto.ts` exports `uploadMealPhoto` (SOLE export, unchanged), keeps its `'use server'` directive, and continues to import `{ put }` from `'@vercel/blob'` and `{ auth }` from `'@/auth'`.
- After the existing File check, adds `const allowed = ['image/jpeg', 'image/png', 'image/webp']` and throws `new Error('Unsupported image type')` when `!allowed.includes(file.type)`. (Anthropic's vision API rejects other types, including iPhone HEIC.)
- Test changes (mocks exactly, existing: `@vercel/blob` `put: vi.fn()`, `@/auth` `auth: vi.fn()`): the existing happy-path test's File is created with `{ type: 'image/jpeg' }` so it passes the new guard; new case — signed-in with a File created with `{ type: 'image/heic' }`, assert it rejects with `'Unsupported image type'` and `put` was not called.

**Testing:**
- Test rejects an unsupported image type

---

## Story 13 — analyzePhoto: send the image's real media type

**Files to modify:**
- `src/lib/llm.ts`
- `src/lib/llm.test.ts`

**Acceptance Criteria:**

- `src/lib/llm.ts` exports `generate` and `analyzePhoto` (its two named exports, unchanged), imports no project modules, and uses global `fetch` only.
- In `analyzePhoto`, after the image fetch succeeds, adds `const mediaType = (imageRes.headers.get('content-type') ?? 'image/jpeg').split(';')[0]`.
- The Anthropic branch's image source uses `media_type: mediaType` instead of the hardcoded `'image/jpeg'`. The Ollama branch is unchanged.
- Test changes (existing pattern: `vi.stubGlobal('fetch', vi.fn())` in beforeEach): every existing `analyzePhoto` image-fetch mock gains `headers: { get: vi.fn(() => 'image/jpeg') }`; new case — `process.env.LLM_PROVIDER = 'anthropic'`, image fetch resolves ok with `headers.get` returning `'image/png'`, assert the JSON body of the Anthropic POST contains `"media_type":"image/png"`.

**Testing:**
- Test passes the fetched content type to the anthropic request

---

## Story 14 — getToday: day boundary in the app timezone

**Files to modify:**
- `src/app/actions/getToday.ts`
- `src/app/actions/getToday.test.ts`

**Acceptance Criteria:**

- `src/app/actions/getToday.ts` exports `getToday` (SOLE export, unchanged), keeps its `'use server'` directive, and continues to import `{ auth }` from `'@/auth'` and `{ prisma }` from `'@/lib/db'`.
- Adds a module-level, non-exported function `startOfToday(now: Date): Date`: reads `const tz = process.env.APP_TIMEZONE ?? 'America/New_York'`; builds `new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' })` and calls `.formatToParts(now)`; converts the `hour`, `minute`, and `second` part values to numbers; computes `const elapsedMs = (hour * 3600 + minute * 60 + second) * 1000 + now.getMilliseconds()`; returns `new Date(now.getTime() - elapsedMs)`.
- The `loggedAt: { gte: ... }` filter uses `startOfToday(new Date())`; the UTC-midnight computation is removed.
- Test setup (mocks exactly, existing: `@/lib/db`, `@/auth`): `vi.useFakeTimers()` and `vi.setSystemTime(new Date('2026-01-15T03:30:00.000Z'))` — that is 22:30 on Jan 14 in New York (EST); `findMany` resolves `[]`, `findUnique` resolves null; call `getToday()`; capture `const arg = vi.mocked(prisma.mealEntry.findMany).mock.calls[0][0]`; assert `expect(arg.where.loggedAt.gte).toEqual(new Date('2026-01-14T05:00:00.000Z'))`; restore with `vi.useRealTimers()` in `afterEach`. Existing tests stay as they are.

**Testing:**
- Test the day boundary is local midnight in the app timezone

---

## Story 15 — Cron hardening: Telegram checks and per-user isolation

**Files to modify:**
- `src/app/api/cron/route.ts`
- `src/app/api/cron/route.test.ts`

**Acceptance Criteria:**

- `src/app/api/cron/route.ts` exports `GET` (SOLE export, unchanged) and continues to import `{ generate }` from `'@/lib/llm'` and `{ prisma }` from `'@/lib/db'`; `sendTelegramMessage` stays a non-exported helper.
- `sendTelegramMessage` first reads `process.env.TELEGRAM_BOT_TOKEN` and `process.env.TELEGRAM_CHAT_ID` into consts and throws `new Error('Telegram not configured')` when either is missing. It captures the fetch result in `const res` and throws `new Error('Telegram send failed: ' + res.statusText)` when `res.ok` is false.
- The per-user prompt becomes `'Write a short, friendly daily nutrition check-in message for ' + (user.name ?? 'the user') + '. Ask how they plan to eat today. Reply with the message only.'`
- The per-user body (`generate` + `sendTelegramMessage`) is wrapped in try/catch: success increments `sent`, failure increments `failed` and calls `console.error` with the error. The success response becomes `Response.json({ ok: failed === 0, sent, failed })`. The 401 guard is unchanged.
- Test changes (mocks exactly, existing: `@/lib/db`, `@/lib/llm`, stubbed global fetch, env vars in beforeEach): update the existing sent-count assertion to expect `{ ok: true, sent: 2, failed: 0 }` with two users; new cases — fetch resolves `{ ok: false, statusText: 'Forbidden' }` with one user, assert the response json equals `{ ok: false, sent: 0, failed: 1 }` and status is 200; `delete process.env.TELEGRAM_BOT_TOKEN` with one user, assert the response json equals `{ ok: false, sent: 0, failed: 1 }`. The two 401 tests stay as they are.

**Testing:**
- Test a telegram send failure is isolated per user
- Test missing telegram config counts as a failure

---

## Story 16 — Chat history read action

**Files to create:**
- `src/app/actions/getChatHistory.ts`
- `src/app/actions/getChatHistory.test.ts`

**Acceptance Criteria:**

- `src/app/actions/getChatHistory.ts` exports `getChatHistory()` (SOLE export; let TypeScript infer the return type) and starts with `'use server';`.
- Imports `{ auth }` from `'@/auth'` and `{ prisma }` from `'@/lib/db'`. First line inside the function: `const session = await auth()`; throws `new Error('Unauthorized')` if `!session?.user?.id`.
- Fetches `prisma.chatMessage.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: 'desc' }, take: 20 })`, reverses to chronological order with `.reverse()`, and returns the messages mapped to `{ id, role, content }`.
- Test setups (mocks exactly: `@/auth` `auth: vi.fn()`, `@/lib/db` `prisma: { chatMessage: { findMany: vi.fn() } }`): unauthorized — `auth` resolves null, assert it rejects with `'Unauthorized'`; mapping — `auth` resolves `{ user: { id: 'u1' } }`, `findMany` resolves `[{ id: 'm2', userId: 'u1', role: 'assistant', content: 'second', createdAt: new Date() }, { id: 'm1', userId: 'u1', role: 'user', content: 'first', createdAt: new Date() }]`, assert the return equals `[{ id: 'm1', role: 'user', content: 'first' }, { id: 'm2', role: 'assistant', content: 'second' }]`. Write ONLY these tests.

**Testing:**
- Test throws Unauthorized when no session
- Test returns chronological mapped messages

---

## Story 17 — ChatClient component

**Depends on:** Story 4

**Files to create:**
- `src/components/ChatClient.tsx`
- `src/components/ChatClient.test.tsx`

**Acceptance Criteria:**

- Default-exports a component named `ChatClient`, marked `'use client'`. Props: `{ initialMessages: Array<{ id: string; role: string; content: string }> }`.
- Imports `{ sendChatMessage }` from `'@/app/actions/sendChatMessage'` and `{ useState }` from `'react'`.
- Holds messages in `useState` initialized from `initialMessages`; renders one `<div>` per message containing its `content`, with className containing `text-right` when `role === 'user'`.
- Renders an input with the accessible label `Message` and a button `Send`; the button is disabled while a send is in flight.
- Send: ignores empty/whitespace-only input; otherwise calls `sendChatMessage(text)`, then appends the user message and `{ role: 'assistant', content: assistantReply }` (ids via `crypto.randomUUID()`), and clears the input. On a thrown error, renders the message text in a `<p>` with className containing `text-red-500` and appends nothing.
- Test setups (mocks exactly: `@/app/actions/sendChatMessage`): initial render — two initial messages, assert both content strings appear; send — action resolves `{ assistantReply: 'Nice plan!' }`, type `hello coach` and click `Send`, assert `hello coach` and `Nice plan!` both appear and the action was called with `'hello coach'`; error — action rejects with `new Error('Message cannot be empty')`, assert that text appears. Write ONLY these tests.

**Testing:**
- Test renders the initial messages
- Test sends a message and appends the reply
- Test shows an error and appends nothing

---

## Story 18 — Chat page

**Depends on:** Story 16, Story 17

**Files to create:**
- `src/app/chat/page.tsx`
- `src/app/chat/page.test.tsx`

**Acceptance Criteria:**

- `src/app/chat/page.tsx` default-exports `async function ChatPage()` and also `export const dynamic = 'force-dynamic'`.
- Imports `{ auth }` from `'@/auth'`, `{ getChatHistory }` from `'@/app/actions/getChatHistory'`, and `ChatClient` (default) from `'@/components/ChatClient'`.
- With no session, renders the text `Sign in to chat` and does NOT call `getChatHistory`. With a session, calls `getChatHistory()` and renders `<ChatClient initialMessages={messages} />`.
- Test setups (mocks exactly: `@/auth` `auth: vi.fn()`, `@/app/actions/getChatHistory` `getChatHistory: vi.fn()`, `@/components/ChatClient` default export `vi.fn(() => <div data-testid="chat-client" />)`): signed-out — `auth` resolves null, render `await ChatPage()`, assert `Sign in to chat` appears and `getChatHistory` was not called; signed-in — `auth` resolves `{ user: { id: 'u1' } }` and `getChatHistory` resolves `[]`, assert the element with `data-testid="chat-client"` is present. Write ONLY these tests.

**Testing:**
- Test prompts a signed-out visitor
- Test renders the chat for a signed-in user

---

## Story 19 — Delete meal entry action

**Files to create:**
- `src/app/actions/deleteMealEntry.ts`
- `src/app/actions/deleteMealEntry.test.ts`

**Acceptance Criteria:**

- `src/app/actions/deleteMealEntry.ts` exports `deleteMealEntry(id: string)` (SOLE export; let TypeScript infer the return type) and starts with `'use server';`.
- Imports `{ auth }` from `'@/auth'`, `{ prisma }` from `'@/lib/db'`, and `{ z }` from `'zod'`. Auth-first: `const session = await auth()`; throws `new Error('Unauthorized')` if `!session?.user?.id`.
- Validates `id` with `z.string().min(1)`; throws `new Error('Invalid meal id')` on failure (check `err.issues` — Zod v4).
- Calls `const result = await prisma.mealEntry.deleteMany({ where: { id: parsed, userId: session.user.id } })` — scoped by `userId` so a user can only delete their own rows. Throws `new Error('Meal not found')` when `result.count === 0`. Returns `{ deleted: true }`.
- Test setups (mocks exactly: `@/auth` `auth: vi.fn()`, `@/lib/db` `prisma: { mealEntry: { deleteMany: vi.fn() } }`): unauthorized — `auth` resolves null, assert rejects with `'Unauthorized'`; scoped delete — signed-in as `u1`, `deleteMany` resolves `{ count: 1 }`, call with `'meal-1'`, then capture `const arg = vi.mocked(prisma.mealEntry.deleteMany).mock.calls[0][0]` and assert on separate lines `expect(arg.where.id).toBe('meal-1')` and `expect(arg.where.userId).toBe('u1')`, and assert the return equals `{ deleted: true }`; not-found — `deleteMany` resolves `{ count: 0 }`, assert rejects with `'Meal not found'`. Write ONLY these tests.

**Testing:**
- Test throws Unauthorized when no session
- Test deletes the meal scoped to the signed-in user
- Test throws Meal not found when nothing was deleted

---

## Story 20 — DeleteMealButton component

**Depends on:** Story 19

**Files to create:**
- `src/components/DeleteMealButton.tsx`
- `src/components/DeleteMealButton.test.tsx`

**Acceptance Criteria:**

- Default-exports a component named `DeleteMealButton`, marked `'use client'`. Props: `{ mealId: string }`.
- Imports `{ deleteMealEntry }` from `'@/app/actions/deleteMealEntry'`, `{ useRouter }` from `'next/navigation'`, and `{ useState }` from `'react'`.
- Renders a `<button>` with `aria-label="Delete meal"`. On click: disables itself while busy, awaits `deleteMealEntry(mealId)`, then calls `router.refresh()`. On a thrown error it re-enables and calls `console.error` with the error instead of refreshing.
- Test setups (mocks exactly: `@/app/actions/deleteMealEntry`, `next/navigation` with `useRouter: () => ({ refresh: vi.fn() })` where the refresh spy is a shared const the tests can read): success — action resolves, click the `Delete meal` button, assert the action was called with the mealId and `refresh` was called; failure — action rejects, assert `refresh` was not called. Write ONLY these tests.

**Testing:**
- Test deletes the meal and refreshes
- Test a failed delete does not refresh

---

## Story 21 — Delete button on the dashboard rows

**Depends on:** Story 9, Story 20

**Files to modify:**
- `src/components/TodayDashboard.tsx`
- `src/components/TodayDashboard.test.tsx`

**Acceptance Criteria:**

- The file continues to default-export the component named `TodayDashboard`, marked `'use client'`, with unchanged props.
- Additionally imports `DeleteMealButton` (default) from `'@/components/DeleteMealButton'` and renders `<DeleteMealButton mealId={meal.id} />` inside each meal row, after the Badge.
- Test changes: add the module-level mock `vi.mock('@/components/DeleteMealButton', () => ({ default: vi.fn(() => <button aria-label="Delete meal" />) }))`; new case — render with two meals and assert two elements with the accessible name `Delete meal` are present. Existing tests stay as they are.

**Testing:**
- Test each meal row renders a delete button

---

## Story 22 — NavBar component

**Files to create:**
- `src/components/NavBar.tsx`
- `src/components/NavBar.test.tsx`

**Acceptance Criteria:**

- Default-exports a component named `NavBar` (a server component — no `'use client'` needed). Imports `Link` (default) from `'next/link'` and nothing else.
- Renders a `<nav>` containing three `Link`s in order: text `Home` with `href="/"`, text `Targets` with `href="/targets"`, text `Chat` with `href="/chat"`.
- Test setup (no mocks — `next/link` renders an anchor under test): render and assert the links with accessible names `Home`, `Targets`, and `Chat` have hrefs `/`, `/targets`, and `/chat` respectively. Write ONLY this test.

**Testing:**
- Test renders the home targets and chat links

---

## Story 23 — Layout renders the NavBar

**Depends on:** Story 7, Story 22

**Files to modify:**
- `src/app/layout.tsx`
- `src/app/layout.test.tsx`

**Acceptance Criteria:**

- `src/app/layout.tsx` additionally imports `NavBar` (default) from `'@/components/NavBar'` and renders `<NavBar />` inside `<body>`, immediately above `{children}`.
- `src/app/layout.tsx` continues to default-export `RootLayout`; `metadata` remains a named export. Nothing else changes.
- `src/app/layout.test.tsx` (created in Story 7, `next/font/google` already mocked there) adds the module-level mock `vi.mock('@/components/NavBar', () => ({ default: vi.fn(() => <nav data-testid="nav-bar" />) }))`. New test: render `<RootLayout><p>child</p></RootLayout>` (the jsdom nesting warning about `<html>` is acceptable) and assert the element with `data-testid="nav-bar"` is present. Existing tests stay as they are.

**Testing:**
- Test the layout renders the nav bar
