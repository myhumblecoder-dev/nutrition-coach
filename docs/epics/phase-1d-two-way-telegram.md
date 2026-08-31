# Phase 1d — two-way Telegram

Phase 1c closed the browser loop (verified in production 2026-08-31: sign-in →
targets → photo → vision → confirm → dashboard → chat all work). Telegram is
still one-directional: the daily cron delivers, but the five messages Thomas
sent the bot sit unanswered in `getUpdates` because nothing consumes them.

This phase makes the bot two-way: send it a meal photo → the same vision/save
pipeline runs and it replies with the logged estimate; send it text → the chat
coach replies. It also makes the coach context-aware (it currently asks the
user for numbers the dashboard already knows).

**Architecture note driving the slicing:** every mutation lives in a
session-gated server action (`auth()` first line), but a Telegram webhook has
no session. Stories 1–5 extract sessionless cores into `src/lib/` and turn the
actions into thin authed wrappers; the webhook (story 7) then calls the cores
with an explicitly resolved userId.

**Verified facts (from the tree and production, not assumed):**
- All action modules use NAMED exports; `'use server'` directives are present
  and guarded by `serverDirective.test.ts`.
- `saveMealEntry(input)` validates with zod then `prisma.mealEntry.create`;
  `sendChatMessage(userText)` fetches last-10 history desc, reverses, builds a
  prompt, calls `generate`, persists both messages, returns
  `{ assistantReply }`. Both begin `const session = await auth()`.
- `analyzeMeal(photoUrl)` (`'use server'`, no auth check) is safely callable
  server-side; it returns `{ foodItems, totalCalories, totalProtein }`.
- `src/lib/llm.ts` exports `generate` and `analyzePhoto`; `src/lib/db.ts`
  exports `prisma`.
- The cron route keeps its own private `sendTelegramMessage` helper — leave it;
  a follow-up can migrate it to the new lib.
- Telegram: bot token + `TELEGRAM_CHAT_ID` env verified working in production
  (direct send delivered 2026-08-31). `message.chat.id` in updates is a
  NUMBER — compare with `String(...)`. Photo messages carry `photo` as an
  array of sizes, largest LAST. `getFile` returns `result.file_path`; the
  download URL is `https://api.telegram.org/file/bot<TOKEN>/<file_path>`.
- Webhook auth: Telegram echoes the `secret_token` passed to `setWebhook` in
  the `x-telegram-bot-api-secret-token` request header. Return 200 even on
  handled errors — Telegram retries non-200s, which would loop a poison update.
- Single-user app: resolve the target user with `prisma.user.findFirst()`.
- `@vercel/blob` is installed; the store is public; `put(name, body,
  { access: 'public', addRandomSuffix: true })` returns `{ url }`.
- The timezone day-boundary recipe (Intl.DateTimeFormat, hourCycle h23,
  APP_TIMEZONE default America/New_York) lives non-exported in
  `getToday.ts:startOfToday` — story 6 duplicates it privately rather than
  coupling chat to a page action.

---

## Story 1 — Telegram client lib

**Files to create:**
- `src/lib/telegram.ts`
- `src/lib/telegram.test.ts`

**Acceptance Criteria:**

- `src/lib/telegram.ts` exports `sendTelegramMessage` and `getTelegramFileUrl` (its two named exports). It imports no project modules and uses global `fetch` only.
- `sendTelegramMessage(chatId: string, text: string)`: reads `process.env.TELEGRAM_BOT_TOKEN` into a const and throws `new Error('Telegram not configured')` when missing. POSTs JSON `{ chat_id: chatId, text }` to `'https://api.telegram.org/bot' + token + '/sendMessage'` with header `'content-type': 'application/json'`. Captures the result in `const res`; throws `new Error('Telegram send failed: ' + res.statusText)` when `res.ok` is false. Returns nothing.
- `getTelegramFileUrl(fileId: string)`: same token guard. Fetches `'https://api.telegram.org/bot' + token + '/getFile?file_id=' + fileId`; throws `new Error('Telegram getFile failed')` when `res.ok` is false; reads `const data = await res.json()`; throws `new Error('Telegram getFile failed')` when `!data.ok || !data.result?.file_path`; returns `'https://api.telegram.org/file/bot' + token + '/' + data.result.file_path`.
- Test setups (mock: `vi.stubGlobal('fetch', vi.fn())` in beforeEach; set `process.env.TELEGRAM_BOT_TOKEN = 'bot123'` in beforeEach): send failure — fetch resolves `{ ok: false, statusText: 'Forbidden' }`, assert `sendTelegramMessage('c1', 'hi')` rejects with `'Telegram send failed: Forbidden'`; file url — fetch resolves `{ ok: true, json: async () => ({ ok: true, result: { file_path: 'photos/f1.jpg' } }) }`, assert the return equals `'https://api.telegram.org/file/bot123/photos/f1.jpg'`; missing config — `delete process.env.TELEGRAM_BOT_TOKEN`, assert `sendTelegramMessage('c1', 'hi')` rejects with `'Telegram not configured'`. Write ONLY these tests.

**Testing:**
- Test send failure throws with the status text
- Test getTelegramFileUrl builds the download url
- Test missing token throws Telegram not configured

---

## Story 2 — Sessionless meal core

**Files to create:**
- `src/lib/meals.ts`
- `src/lib/meals.test.ts`

**Acceptance Criteria:**

- `src/lib/meals.ts` exports `logMealForUser` (SOLE export). Imports `{ prisma }` from `'@/lib/db'` and `{ z }` from `'zod'`. No auth import — callers resolve the user.
- `logMealForUser(userId: string, input: { photoUrl: string; foodItems: Array<{ name: string; portion: string; calories: number; protein: number }>; totalCalories: number; totalProtein: number })`: validates `input` with the same zod schema `saveMealEntry` uses today (`photoUrl: z.string().url()`, non-empty foodItems array of trimmed min-1 strings and nonnegative ints, nonnegative int totals); throws `new Error('Invalid meal entry data')` on failure (check `err.issues` — Zod v4). Creates via `prisma.mealEntry.create` with `userId`, `photoUrl`, `foodItems: JSON.stringify(parsed.foodItems)`, the totals, and `confirmed: true`. Returns `{ id: created.id }`.
- Test setups (mocks exactly: `@/lib/db` `prisma: { mealEntry: { create: vi.fn() } }`): create path — `create` resolves `{ id: 'entry-1' }`, call with userId `'u1'` and a valid input, capture `const arg = vi.mocked(prisma.mealEntry.create).mock.calls[0][0]`, assert on separate lines `expect(arg.data.userId).toBe('u1')` and `expect(arg.data.confirmed).toBe(true)`, assert the return equals `{ id: 'entry-1' }`; invalid input — photoUrl `'not-a-url'`, assert rejects with `'Invalid meal entry data'` and `create` was not called. Write ONLY these tests.

**Testing:**
- Test creates the meal for the given user
- Test rejects invalid meal data before touching the database

---

## Story 3 — saveMealEntry delegates to the meal core

**Depends on:** Story 2

**Files to modify:**
- `src/app/actions/saveMealEntry.ts`
- `src/app/actions/saveMealEntry.test.ts`

**Acceptance Criteria:**

- `src/app/actions/saveMealEntry.ts` exports `saveMealEntry` (SOLE export, unchanged signature) and keeps its `'use server'` directive and auth-first guard (`Unauthorized`). The zod schema and `prisma.mealEntry.create` call are REMOVED from this file; after the guard it returns `logMealForUser(session.user.id, input)`.
- Its imports become `{ auth }` from `'@/auth'` and `{ logMealForUser }` from `'@/lib/meals'` — the `@/lib/db` and `zod` imports are removed.
- `src/app/actions/saveMealEntry.test.ts` is REWRITTEN: mocks exactly `@/auth` (`auth: vi.fn()`) and `@/lib/meals` (`logMealForUser: vi.fn()`); keep the directive-guard test (readFileSync first-line assertion) as-is. Test setups: unauthorized — `auth` resolves null, assert rejects with `'Unauthorized'` and `logMealForUser` was not called; delegation — `auth` resolves `{ user: { id: 'u1' } }`, `logMealForUser` resolves `{ id: 'entry-1' }`, call with a valid input object, assert `logMealForUser` was called with `'u1'` as first arg and the input as second, and the return equals `{ id: 'entry-1' }`.

**Testing:**
- Test throws Unauthorized when no session
- Test delegates to the meal core with the session user id

---

## Story 4 — Sessionless chat core

**Files to create:**
- `src/lib/chat.ts`
- `src/lib/chat.test.ts`

**Acceptance Criteria:**

- `src/lib/chat.ts` exports `coachReply` (SOLE export). Imports `{ prisma }` from `'@/lib/db'`, `{ generate }` from `'@/lib/llm'`, and `{ z }` from `'zod'`. No auth import.
- `coachReply(userId: string, userText: string)`: validates `userText` with `z.string().trim().min(1)`, throwing `new Error('Message cannot be empty')` on failure. Ports the body of today's `sendChatMessage` verbatim with `userId` in place of `session.user.id`: fetch last 10 `chatMessage`s desc, `.reverse()`, build the `'You are a friendly daily nutrition and fitness coach...'` prompt with history lines `role + ': ' + content`, call `generate(prompt)`, persist the user and assistant messages, return `{ assistantReply: reply }`.
- Test setups (mocks exactly: `@/lib/db` `prisma: { chatMessage: { findMany: vi.fn(), create: vi.fn() } }`, `@/lib/llm` `generate: vi.fn()`): empty input — assert `coachReply('u1', '   ')` rejects with `'Message cannot be empty'`; reply path — `findMany` resolves `[]`, `generate` resolves `'Great job!'`, `create` resolves `{}`, call `coachReply('u1', 'how did I do?')`, assert `generate`'s prompt argument contains `'user: how did I do?'`, assert `create` was called twice, assert the return equals `{ assistantReply: 'Great job!' }`. Write ONLY these tests.

**Testing:**
- Test rejects an empty message
- Test generates persists and returns the reply

---

## Story 5 — sendChatMessage delegates to the chat core

**Depends on:** Story 4

**Files to modify:**
- `src/app/actions/sendChatMessage.ts`
- `src/app/actions/sendChatMessage.test.ts`

**Acceptance Criteria:**

- `src/app/actions/sendChatMessage.ts` exports `sendChatMessage` (SOLE export, unchanged signature), keeps its `'use server'` directive and auth-first `Unauthorized` guard, and after the guard returns `coachReply(session.user.id, userText)`. The history/prompt/persist logic is REMOVED from this file.
- Its imports become `{ auth }` from `'@/auth'` and `{ coachReply }` from `'@/lib/chat'` — the `@/lib/db`, `@/lib/llm`, and `zod` imports are removed.
- `src/app/actions/sendChatMessage.test.ts` is REWRITTEN: mocks exactly `@/auth` (`auth: vi.fn()`) and `@/lib/chat` (`coachReply: vi.fn()`); keep the directive-guard test as-is. Test setups: unauthorized — `auth` resolves null, assert rejects with `'Unauthorized'` and `coachReply` was not called; delegation — `auth` resolves `{ user: { id: 'u1' } }`, `coachReply` resolves `{ assistantReply: 'Great job!' }`, assert `coachReply` was called with `('u1', 'how did I do?')` and the return equals `{ assistantReply: 'Great job!' }`.

**Testing:**
- Test throws Unauthorized when no session
- Test delegates to the chat core with the session user id

---

## Story 6 — Context-aware coach

**Depends on:** Story 4

**Files to modify:**
- `src/lib/chat.ts`
- `src/lib/chat.test.ts`

**Acceptance Criteria:**

- `src/lib/chat.ts` exports `coachReply` (SOLE export, unchanged signature); adds `dailyTarget.findUnique` and `mealEntry.findMany` usage via the existing `{ prisma }` import.
- Adds a module-level, non-exported `startOfToday(now: Date): Date` — the same recipe as `getToday.ts`: tz from `process.env.APP_TIMEZONE ?? 'America/New_York'`, `Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(now)`, `elapsedMs` from the parts plus `now.getMilliseconds()`, return `new Date(now.getTime() - elapsedMs)`.
- Before building the prompt, `coachReply` fetches the user's `dailyTarget` (`findUnique` by userId) and today's meals (`findMany` where userId and `loggedAt: { gte: startOfToday(new Date()) }`), sums `totalCalories`/`totalProtein`, and when a target exists inserts the line `'Today so far: ' + consumedCal + ' of ' + target.calories + ' cal, ' + consumedProtein + 'g of ' + target.protein + 'g protein.\n'` immediately after the coach-persona sentence. With no target the prompt is unchanged.
- Test setups (extend the existing mocks with `prisma: { chatMessage: {...}, dailyTarget: { findUnique: vi.fn() }, mealEntry: { findMany: vi.fn() } }`): context case — target `{ calories: 2000, protein: 150 }`, meals `[{ totalCalories: 485, totalProtein: 37 }]`, assert the prompt passed to `generate` contains `'Today so far: 485 of 2000 cal, 37g of 150g protein.'`; no-target case — `findUnique` resolves null, meals `[]`, assert the prompt does NOT contain `'Today so far:'`. Existing tests updated so `findUnique` resolves null and `findMany` resolves `[]` by default.

**Testing:**
- Test the prompt includes today's totals when a target exists
- Test the prompt omits the context line without a target

---

## Story 7 — Telegram webhook route

**Depends on:** Story 1, Story 2, Story 4

**Files to create:**
- `src/app/api/telegram/route.ts`
- `src/app/api/telegram/route.test.ts`

**Acceptance Criteria:**

- `src/app/api/telegram/route.ts` exports `POST(request: Request)` (SOLE export; let TypeScript infer the return type).
- Imports `{ sendTelegramMessage, getTelegramFileUrl }` from `'@/lib/telegram'`, `{ logMealForUser }` from `'@/lib/meals'`, `{ coachReply }` from `'@/lib/chat'`, `{ analyzeMeal }` from `'@/app/actions/analyzeMeal'`, `{ put }` from `'@vercel/blob'`, and `{ prisma }` from `'@/lib/db'`.
- Auth: reads `process.env.TELEGRAM_WEBHOOK_SECRET`; when the secret is missing or the `x-telegram-bot-api-secret-token` request header does not equal it, returns `Response.json({ ok: false }, { status: 401 })`.
- Reads `const update = await request.json()` and `const message = update?.message`. When there is no message, or `String(message.chat?.id)` does not equal `process.env.TELEGRAM_CHAT_ID`, returns `Response.json({ ok: true, ignored: true })`.
- Resolves `const user = await prisma.user.findFirst()`; when null returns `Response.json({ ok: true, ignored: true })`.
- The remaining work is wrapped in try/catch. PHOTO branch — when `message.photo` is a non-empty array: take the LAST element's `file_id` (largest size), `const fileUrl = await getTelegramFileUrl(fileId)`, fetch it and throw `new Error('Failed to download photo')` unless ok, `const blob = await put('telegram-meal.jpg', await res.blob(), { access: 'public', addRandomSuffix: true })`, `const analysis = await analyzeMeal(blob.url)`, `await logMealForUser(user.id, { photoUrl: blob.url, ...analysis })`, then `await sendTelegramMessage(chatId, 'Logged: ' + analysis.foodItems.map((i) => i.name).join(', ') + ' — ' + analysis.totalCalories + ' cal, ' + analysis.totalProtein + 'g protein.')` where `chatId` is `String(message.chat.id)`. TEXT branch — else when `message.text` is a non-empty string: `const { assistantReply } = await coachReply(user.id, message.text)` then `await sendTelegramMessage(chatId, assistantReply)`. Neither branch matching returns `Response.json({ ok: true, ignored: true })`.
- Success returns `Response.json({ ok: true })`. The catch logs via `console.error` and returns `Response.json({ ok: false }, { status: 200 })` — ALWAYS 200 for processed updates, because Telegram retries non-200 responses and a poison update would loop forever.
- Test setups (mocks exactly: `@/lib/telegram` (`sendTelegramMessage: vi.fn(), getTelegramFileUrl: vi.fn()`), `@/lib/meals` (`logMealForUser: vi.fn()`), `@/lib/chat` (`coachReply: vi.fn()`), `@/app/actions/analyzeMeal` (`analyzeMeal: vi.fn()`), `@vercel/blob` (`put: vi.fn()`), `@/lib/db` (`prisma: { user: { findFirst: vi.fn() } }`); stub global fetch resolving `{ ok: true, blob: async () => new Blob(['x']) }`; in beforeEach set `process.env.TELEGRAM_WEBHOOK_SECRET = 'hook-secret'` and `process.env.TELEGRAM_CHAT_ID = '5519'`; build requests with `new Request('http://test/api/telegram', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'hook-secret' }, body: JSON.stringify(update) })`): 401 case — wrong header value, assert status 401; text case — `findFirst` resolves `{ id: 'u1' }`, update `{ message: { chat: { id: 5519 }, text: 'hi coach' } }`, `coachReply` resolves `{ assistantReply: 'Hello!' }`, assert `coachReply` called with `('u1', 'hi coach')` and `sendTelegramMessage` called with `('5519', 'Hello!')`; photo case — update with `photo: [{ file_id: 'small' }, { file_id: 'big' }]`, `getTelegramFileUrl` resolves a url, `put` resolves `{ url: 'https://blob/x.jpg' }`, `analyzeMeal` resolves `{ foodItems: [{ name: 'Salad', portion: '1 bowl', calories: 300, protein: 12 }], totalCalories: 300, totalProtein: 12 }`, `logMealForUser` resolves `{ id: 'e1' }`, assert `getTelegramFileUrl` was called with `'big'` and `logMealForUser` was called with `'u1'` as first arg. Write ONLY these tests.

**Testing:**
- Test rejects a request with the wrong webhook secret
- Test a text message gets a coach reply
- Test a photo message logs the meal from the largest size

---

## Ops (not a story — operator checklist)

- Generate a `TELEGRAM_WEBHOOK_SECRET` (random 32+ chars) and add it to Vercel Production.
- After the epic deploys, register the webhook: `curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://nutrition-coach-omega.vercel.app/api/telegram&secret_token=<SECRET>"` — note setWebhook DISABLES getUpdates polling and delivers the backlog to the webhook.
- Verify by texting the bot and sending it a food photo.
- Follow-up candidates deliberately out of scope: migrate the cron route to `src/lib/telegram.ts`; typed error results in the UI (prod masks server-action throws as React #441); photo captions as meal notes.
