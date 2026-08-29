# Epic: Phase 1 — Core Nutrition Coach MVP

Greenfield Next.js 16 + Auth.js + Prisma + Neon + Vercel Blob nutrition and fitness coach.
Single-user, photo-first meal logging with AI vision analysis, daily intake tracking, and a chat check-in mode.

**Stack:** Next.js 16 (App Router, `src/proxy.ts` for auth guard) · next-auth v5 (beta, single-user email provider) · @auth/prisma-adapter · Prisma 6 · Neon Postgres · Vercel Blob · Zod v4 · Vitest + RTL · Tailwind · shadcn/ui

**LLM seam:** `src/lib/llm.ts` — `analyzePhoto(imageUrl: string, systemPrompt: string): Promise<string>` (vision) and `generate(prompt: string): Promise<string>` (chat/text). Branches on `LLM_PROVIDER` env var: `'anthropic'` (prod) or default Ollama (dev/fallback).

**Prisma singleton:** `src/lib/db.ts` exports `prisma` (Auth.js convention).

**Decisions taken — amend if wrong:**
- `MealEntry.foodItems` stored as `String` (JSON-encoded array of `{name, portion, calories, protein}`).
- `ChatMessage.role` stored as plain `String` (values `'user'` or `'assistant'`).
- `DailyTarget` is a single row keyed on `userId @unique` (upsert pattern); no date range for MVP.
- Daily cron at `0 13 * * *` (8 am ET) sends a check-in via Telegram (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` env vars).
- Auth: email-magic-link provider; single user.
- `src/proxy.ts` protects all routes except `api`, `_next/*`, `favicon.ico`, and `sign-in`.
- Next.js 16 uses `src/proxy.ts` (NOT `src/middleware.ts`) — confirmed from `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`.

---

## Story 1 — Prisma schema: auth models + nutrition models

**Files to create:**
- `prisma/schema.prisma`

**Acceptance Criteria:**
- `prisma/schema.prisma` contains `generator client` with `provider = "prisma-client-js"` and `binaryTargets = ["native", "rhel-openssl-3.0.x"]`; and `datasource db` with `provider = "postgresql"` and `url = env("DATABASE_URL")`.
- Auth.js adapter models present verbatim: `User`, `Account`, `Session`, `VerificationToken` with exact field names required by `@auth/prisma-adapter`.
- `DailyTarget` model: fields `id String @id @default(cuid())`, `userId String @unique`, `calories Int`, `protein Int`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`; relation `user User @relation(fields: [userId], references: [id], onDelete: Cascade)`.
- `MealEntry` model: fields `id String @id @default(cuid())`, `userId String`, `photoUrl String`, `foodItems String`, `totalCalories Int`, `totalProtein Int`, `confirmed Boolean @default(false)`, `loggedAt DateTime @default(now())`; relation `user User @relation(fields: [userId], references: [id], onDelete: Cascade)`.
- `ChatMessage` model: fields `id String @id @default(cuid())`, `userId String`, `role String`, `content String`, `createdAt DateTime @default(now())`; relation `user User @relation(fields: [userId], references: [id], onDelete: Cascade)`.
- `User` model includes back-relations: `dailyTarget DailyTarget?`, `mealEntries MealEntry[]`, `chatMessages ChatMessage[]`.
- Implements EXACTLY these models; no extra models, no variants.

**Testing:** not applicable — schema file; there is no unit under test.

---

## Story 2 — LLM text generation: `src/lib/llm.ts` (generate function)

**Files to create:**
- `src/lib/llm.ts`
- `src/lib/llm.test.ts`

**Acceptance Criteria:**
- `src/lib/llm.ts` exports `generate(prompt: string): Promise<string>` (SOLE export of this file in this story; Story 3 adds `analyzePhoto` by modifying the same file).
- `generate` branches on `process.env.LLM_PROVIDER`: if the value is `'anthropic'`, it POSTs to `'https://api.anthropic.com/v1/messages'` with headers `x-api-key` set to `process.env.ANTHROPIC_API_KEY`, `'anthropic-version'` set to `'2023-06-01'`, and `'content-type'` set to `'application/json'`; request body includes `model` defaulting to `'claude-3-5-haiku-20241022'`, `max_tokens: 1024`, and `messages: [{ role: 'user', content: prompt }]`; returns `data.content[0].text`. Otherwise (any other value or undefined, defaulting to Ollama), it POSTs to the Ollama generate endpoint at the base URL from `process.env.OLLAMA_BASE_URL` (default `'http://localhost:11434'`) concatenated with `/api/generate`; body includes `model` defaulting to `'gemma4:26b'`, `prompt`, and `stream: false`; returns `data.response`.
- Throws `new Error` on any response where `res.ok` is false; the error message must contain the HTTP status text.
- Implement `generate` EXACTLY ONCE; do NOT emit alternate variants or re-exports. Let TypeScript infer the return type; do NOT annotate as `Promise<any>`.
- `src/lib/llm.ts` imports no other modules from the project. It uses global `fetch` only.
- `src/lib/llm.test.ts` imports `{ generate }` from `'./llm'`. It mocks global `fetch` with `vi.stubGlobal('fetch', vi.fn())` in `beforeEach`. Write ONLY these tests.

**Testing:**
- Test generate returns ollama response text when LLM_PROVIDER is unset
- Test generate returns anthropic content text when LLM_PROVIDER is anthropic
- Test generate throws on non-ok response

---

## Story 3 — LLM vision analysis: add `analyzePhoto` to `src/lib/llm.ts`

**Depends on:** #2

**Files to modify:**
- `src/lib/llm.ts`
- `src/lib/llm.test.ts`

**Acceptance Criteria:**
- `src/lib/llm.ts` exports `analyzePhoto(imageUrl: string, systemPrompt: string): Promise<string>` — after this story `src/lib/llm.ts` exports `generate` (from Story 2) and `analyzePhoto` as two named exports.
- `analyzePhoto` first fetches `imageUrl` using global `fetch` and converts the response body to a base64 string: `Buffer.from(await imageRes.arrayBuffer()).toString('base64')`. Throws `new Error('Failed to fetch image')` if the image fetch returns a response where `ok` is false.
- If `process.env.LLM_PROVIDER` is `'anthropic'`, POSTs to `'https://api.anthropic.com/v1/messages'`; body includes `model` defaulting to `'claude-3-5-haiku-20241022'`, `max_tokens: 1024`, and `messages` as an array with one user message whose `content` is an array: first element an object `{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64String } }`, second element `{ type: 'text', text: systemPrompt }`; returns `data.content[0].text`.
- Otherwise (Ollama), POSTs to the Ollama generate endpoint with body including `model` defaulting to `'llava'`, `prompt: systemPrompt`, `images: [base64String]`, `stream: false`; returns `data.response`.
- Throws `new Error` on any LLM response where `res.ok` is false.
- Implement `analyzePhoto` EXACTLY ONCE; do NOT emit alternate variants.
- `src/lib/llm.test.ts` adds tests for `analyzePhoto` to the existing describe block. Write ONLY these tests.

**Testing:**
- Test analyzePhoto fetches image and calls ollama vision with base64
- Test analyzePhoto fetches image and calls anthropic vision with base64
- Test analyzePhoto throws when image fetch is not ok

---

## Story 4 — Auth proxy: `src/proxy.ts`

**Files to create:**
- `src/proxy.ts`
- `src/proxy.test.ts`

**Acceptance Criteria:**
- `src/proxy.ts` exports `config` as `export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon.ico|sign-in).*)'] }` — this is a named export.
- `src/proxy.ts` default-exports `auth` imported from `'@/auth'`: `export default auth`. Imports `auth` from `'@/auth'`. Imports nothing else.
- In Next.js 16, the proxy file is named `src/proxy.ts` (not `src/middleware.ts`); the bare default re-export of `auth` is the correct form confirmed from the Next.js 16 docs and partner-coach-bot convention.
- `src/proxy.test.ts` imports `{ config }` from `'./proxy'` (the named export). Mocks `'@/auth'` at module level: `vi.mock('@/auth', () => ({ auth: vi.fn() }))`. Write ONLY these tests.

**Testing:**
- Test config matcher string contains the catch-all pattern
- Test config matcher string excludes sign-in paths

---

## Story 5 — Vision analysis action: `src/app/actions/analyzeMeal.ts`

**Depends on:** #2, #3

**Files to create:**
- `src/app/actions/analyzeMeal.ts`
- `src/app/actions/analyzeMeal.test.ts`

**Acceptance Criteria:**
- `src/app/actions/analyzeMeal.ts` exports `analyzeMeal(photoUrl: string): Promise<{ foodItems: Array<{ name: string; portion: string; calories: number; protein: number }>; totalCalories: number; totalProtein: number }>` (SOLE export of this file). Let TypeScript infer the return type; do NOT annotate as `Promise<any>`.
- Imports `{ analyzePhoto }` from `'@/lib/llm'` and `{ z }` from `'zod'`. Imports nothing from `'@/lib/db'` or `'@/auth'`.
- The system prompt passed to `analyzePhoto` instructs the model to return ONLY valid JSON with no prose, in the exact shape `{ "foodItems": [{ "name": string, "portion": string, "calories": number, "protein": number }], "totalCalories": number, "totalProtein": number }`.
- Parses the response string with `JSON.parse`, then validates with Zod: `z.object({ foodItems: z.array(z.object({ name: z.string().trim().min(1), portion: z.string().trim().min(1), calories: z.number().int().nonnegative(), protein: z.number().int().nonnegative() })), totalCalories: z.number().int().nonnegative(), totalProtein: z.number().int().nonnegative() })`.
- Throws `new Error('Vision API returned invalid JSON structure')` if `JSON.parse` throws OR if Zod parse fails (check `err.issues` — Zod v4 API).
- Returns the validated object.
- Implement `analyzeMeal` EXACTLY ONCE; do NOT emit alternate variants.
- `src/app/actions/analyzeMeal.test.ts` imports `{ analyzeMeal }` from `'./analyzeMeal'` and mocks `'@/lib/llm'` with `vi.mock('@/lib/llm', () => ({ analyzePhoto: vi.fn() }))`. Write ONLY these tests.

**Testing:**
- Test returns parsed food items for valid vision JSON response
- Test throws containing invalid JSON structure message for non-JSON response
- Test throws for JSON that fails the Zod schema

---

## Story 6 — Save meal entry: auth and validation

**Depends on:** #1

**Files to create:**
- `src/app/actions/saveMealEntry.ts`
- `src/app/actions/saveMealEntry.test.ts`

**Acceptance Criteria:**
- `src/app/actions/saveMealEntry.ts` exports `saveMealEntry(input: { photoUrl: string; foodItems: Array<{ name: string; portion: string; calories: number; protein: number }>; totalCalories: number; totalProtein: number }): Promise<{ id: string }>` (SOLE export of this file). Omit return-type annotation; let TypeScript infer.
- Imports `{ auth }` from `'@/auth'`, `{ prisma }` from `'@/lib/db'`, and `{ z }` from `'zod'`.
- First line inside function body: `const session = await auth()`. Throws `new Error('Unauthorized')` if `!session?.user?.id`.
- Validates input with Zod: `z.object({ photoUrl: z.string().url(), foodItems: z.array(z.object({ name: z.string().trim().min(1), portion: z.string().trim().min(1), calories: z.number().int().nonnegative(), protein: z.number().int().nonnegative() })).min(1), totalCalories: z.number().int().nonnegative(), totalProtein: z.number().int().nonnegative() })`. On Zod failure, checks `err.issues` (Zod v4) and throws `new Error('Invalid meal entry data')`.
- Calls `prisma.mealEntry.create` with data including `userId: session.user.id`, `photoUrl: parsed.photoUrl`, `foodItems: JSON.stringify(parsed.foodItems)`, `totalCalories: parsed.totalCalories`, `totalProtein: parsed.totalProtein`, `confirmed: true`. Returns `{ id: created.id }`.
- Implement EXACTLY ONCE; do NOT emit alternate variants.
- `src/app/actions/saveMealEntry.test.ts` mocks `'@/auth'` with `vi.mock('@/auth', () => ({ auth: vi.fn() }))` and mocks `'@/lib/db'` with `vi.mock('@/lib/db', () => ({ prisma: { mealEntry: { create: vi.fn() } } }))`. Write ONLY these tests.

**Testing:**
- Test throws Unauthorized when auth returns no session
- Test throws Invalid meal entry data when photoUrl is not a URL

---

## Story 7 — Save meal entry: persistence assertions

**Depends on:** #6

**Files to modify:**
- `src/app/actions/saveMealEntry.ts`
- `src/app/actions/saveMealEntry.test.ts`

**Acceptance Criteria:**
- `src/app/actions/saveMealEntry.ts` exports `saveMealEntry` (no implementation changes expected if Story 6 landed correctly; this story adds persistence-path tests only).
- Test setup: mock `auth()` to return `{ user: { id: 'u1' } }`. Mock `prisma.mealEntry.create` to resolve with `{ id: 'entry-1', userId: 'u1', photoUrl: 'https://example.com/photo.jpg', foodItems: '[]', totalCalories: 95, totalProtein: 0, confirmed: true, loggedAt: new Date() }`. Input: `{ photoUrl: 'https://example.com/photo.jpg', foodItems: [{ name: 'Apple', portion: '1 medium', calories: 95, protein: 0 }], totalCalories: 95, totalProtein: 0 }`.
- Call `saveMealEntry(input)`. Capture the create call arg: `const arg = vi.mocked(prisma.mealEntry.create).mock.calls[0][0]`. Assert on separate lines: `expect(arg.data.userId).toBe('u1')`, then `expect(arg.data.confirmed).toBe(true)`, then `expect(arg.data.foodItems).toBe(JSON.stringify([{ name: 'Apple', portion: '1 medium', calories: 95, protein: 0 }]))`.
- `saveMealEntry` returns `{ id: 'entry-1' }`.
- `src/app/actions/saveMealEntry.test.ts` adds tests to the existing describe block. Write ONLY these tests.

**Testing:**
- Test creates mealEntry with correct userId and confirmed=true
- Test returns the id from the created entry

---

## Story 8 — Upsert daily target: `src/app/actions/upsertDailyTarget.ts`

**Depends on:** #1

**Files to create:**
- `src/app/actions/upsertDailyTarget.ts`
- `src/app/actions/upsertDailyTarget.test.ts`

**Acceptance Criteria:**
- `src/app/actions/upsertDailyTarget.ts` exports `upsertDailyTarget(input: { calories: number; protein: number }): Promise<void>` (SOLE export of this file). Omit return-type annotation; let TypeScript infer.
- Imports `{ auth }` from `'@/auth'`, `{ prisma }` from `'@/lib/db'`, and `{ z }` from `'zod'`.
- First line: `const session = await auth()`. Throws `new Error('Unauthorized')` if `!session?.user?.id`.
- Validates with Zod: `z.object({ calories: z.number().int().positive(), protein: z.number().int().positive() })`. Throws `new Error('Invalid target data')` on failure (check `err.issues` — Zod v4).
- Calls `prisma.dailyTarget.upsert({ where: { userId: session.user.id }, create: { ...parsed, userId: session.user.id }, update: parsed })`. `DailyTarget.userId` is `@unique` in schema (Story 1) so upsert by `userId` is valid.
- Returns `void`.
- Implement EXACTLY ONCE; no alternate variants.
- `src/app/actions/upsertDailyTarget.test.ts` mocks `'@/auth'` with `vi.mock('@/auth', () => ({ auth: vi.fn() }))` and mocks `'@/lib/db'` with `vi.mock('@/lib/db', () => ({ prisma: { dailyTarget: { upsert: vi.fn() } } }))`. Write ONLY these tests.

**Testing:**
- Test throws Unauthorized when no session
- Test throws Invalid target data when calories is zero or negative
- Test upserts dailyTarget with correct userId in create object

---

## Story 9 — Chat check-in: auth and validation path

**Depends on:** #1, #2

**Files to create:**
- `src/app/actions/sendChatMessage.ts`
- `src/app/actions/sendChatMessage.test.ts`

**Acceptance Criteria:**
- `src/app/actions/sendChatMessage.ts` exports `sendChatMessage(userText: string): Promise<{ assistantReply: string }>` (SOLE export of this file). Omit return-type annotation; let TypeScript infer.
- Imports `{ auth }` from `'@/auth'`, `{ prisma }` from `'@/lib/db'`, `{ generate }` from `'@/lib/llm'`, and `{ z }` from `'zod'`.
- First line: `const session = await auth()`. Throws `new Error('Unauthorized')` if `!session?.user?.id`.
- Validates `userText` with `z.string().trim().min(1)`. Throws `new Error('Message cannot be empty')` if blank or whitespace only.
- Fetches last 10 chat messages: `prisma.chatMessage.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: 'desc' }, take: 10 })`. Reverses the array to chronological order with `.reverse()`.
- Builds a prompt string by concatenating: the prefix `'You are a friendly daily nutrition and fitness coach. Here is the recent conversation:\n'`, then each history message as the message role + `': '` + the message content joined by newlines, then `'\nuser: '` + the validated userText + `'\nAssistant:'`.
- Calls `const reply = await generate(prompt)`.
- Saves user message: `prisma.chatMessage.create({ data: { userId: session.user.id, role: 'user', content: parsed } })`.
- Saves assistant message: `prisma.chatMessage.create({ data: { userId: session.user.id, role: 'assistant', content: reply } })`.
- Returns `{ assistantReply: reply }`.
- Implement EXACTLY ONCE. Omit return-type annotation; let TypeScript infer.
- `src/app/actions/sendChatMessage.test.ts` mocks `'@/auth'` with `vi.mock('@/auth', () => ({ auth: vi.fn() }))`, mocks `'@/lib/db'` with `vi.mock('@/lib/db', () => ({ prisma: { chatMessage: { findMany: vi.fn(), create: vi.fn() } } }))`, and mocks `'@/lib/llm'` with `vi.mock('@/lib/llm', () => ({ generate: vi.fn() }))`. Write ONLY these tests.

**Testing:**
- Test throws Unauthorized when no session
- Test throws Message cannot be empty for whitespace-only input

---

## Story 10 — Chat check-in: generate and persistence path

**Depends on:** #9

**Files to modify:**
- `src/app/actions/sendChatMessage.ts`
- `src/app/actions/sendChatMessage.test.ts`

**Acceptance Criteria:**
- `src/app/actions/sendChatMessage.ts` exports `sendChatMessage` (no implementation changes expected if Story 9 landed correctly; this story adds integration-path tests only).
- Test setup: mock `auth()` to return `{ user: { id: 'u1' } }`. Mock `prisma.chatMessage.findMany` to resolve with `[{ id: 'm1', userId: 'u1', role: 'user', content: 'earlier message', createdAt: new Date() }]`. Mock `generate` to resolve with `'Great job!'`. Mock `prisma.chatMessage.create` to resolve with `{ id: 'c1', userId: 'u1', role: 'user', content: 'how did I do?', createdAt: new Date() }`.
- Call `sendChatMessage('how did I do?')`. Assert `generate` was called once. Assert the prompt argument passed to `generate` contains the substring `'user: earlier message'` AND contains the substring `'user: how did I do?'` — assert these as two separate `expect(prompt).toContain(...)` calls.
- Assert `prisma.chatMessage.create` was called twice: first call with `data.role === 'user'` and `data.content === 'how did I do?'`, second call with `data.role === 'assistant'` and `data.content === 'Great job!'`.
- Assert the return value is `{ assistantReply: 'Great job!' }`.
- `src/app/actions/sendChatMessage.test.ts` adds tests to the existing describe block. Write ONLY these tests.

**Testing:**
- Test calls generate with history prefix and new message in prompt
- Test saves user and assistant messages
- Test returns assistantReply equal to generate reply

---

## Story 11 — Vercel cron config: `vercel.json`

**Files to create:**
- `vercel.json`

**Acceptance Criteria:**
- `vercel.json` contains exactly `{ "crons": [{ "path": "/api/cron", "schedule": "0 13 * * *" }] }` — a cron that fires daily at 13:00 UTC (8 am ET).
- No other keys.

**Testing:** not applicable — JSON config file; there is no unit under test.

---

## Story 12 — Daily cron route: `src/app/api/cron/route.ts`

**Depends on:** #1, #2, #11

**Files to create:**
- `src/app/api/cron/route.ts`
- `src/app/api/cron/route.test.ts`

**Acceptance Criteria:**
- `src/app/api/cron/route.ts` exports `GET(request: Request): Promise<Response>` (SOLE export of this file). Omit return-type annotation; let TypeScript infer.
- Imports `{ generate }` from `'@/lib/llm'` and `{ prisma }` from `'@/lib/db'`. Imports nothing else from the project.
- First: reads `process.env.CRON_SECRET`. If the secret is missing or the `authorization` header on `request` does not equal `'Bearer ' + secret` (string concatenation, not a template literal), returns `Response.json({ ok: false }, { status: 401 })`.
- Fetches all users: `prisma.user.findMany()`.
- For each user: calls `generate` with a prompt that begins with the string `'Daily nutrition coaching check-in:'` and asks the user how they plan to eat today.
- Sends the reply to Telegram by calling an internal helper function `sendTelegramMessage(text: string): Promise<void>` defined in the same file (not exported). The helper POSTs to the Telegram sendMessage URL by concatenating `'https://api.telegram.org/bot'` with `process.env.TELEGRAM_BOT_TOKEN` with `'/sendMessage'` (plain concatenation). The POST body is `{ chat_id: process.env.TELEGRAM_CHAT_ID, text }`.
- Returns `Response.json({ ok: true, sent: userCount })` where `userCount` is the number of users processed.
- Implement GET EXACTLY ONCE; do NOT emit alternate variants.
- `src/app/api/cron/route.test.ts` mocks `'@/lib/db'` with `vi.mock('@/lib/db', () => ({ prisma: { user: { findMany: vi.fn() } } }))` and mocks `'@/lib/llm'` with `vi.mock('@/lib/llm', () => ({ generate: vi.fn() }))`. Also stubs global `fetch` with `vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))` for the Telegram calls. Sets `process.env.CRON_SECRET = 'test-secret'`, `process.env.TELEGRAM_BOT_TOKEN = 'bot123'`, and `process.env.TELEGRAM_CHAT_ID = 'chat123'` in `beforeEach`. Write ONLY these tests.

**Testing:**
- Test returns 401 when authorization header is missing
- Test returns 401 when wrong secret is provided
- Test calls generate once per user and returns ok with correct sent count
