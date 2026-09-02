# Phase 2a — Public auth (Google + Apple) & per-user Telegram linking

The app opens to the public: Google and Apple become the sign-in options (GitHub stays temporarily, without dangerous email linking), sign-in gets a dedicated `/sign-in` page, and every user can connect their own Telegram chat to their account via a `/start <token>` deep link — replacing the single-user `TELEGRAM_CHAT_ID` gate and `prisma.user.findFirst()` resolution. Design was adversarially reviewed; the security decisions baked into these stories (ADEAL on Google/Apple only, `email_verified` enforcement, private-chats-only, "phone wins" chat rebinding, atomic token consume, auth-gating `analyzeMeal`) are deliberate — do not relax them.

## Story 1 — Auth config factory with Google and Apple providers

Create a testable NextAuth config factory. `NextAuth()` mutates the config object it receives, so the factory lives in its own module and `src/auth.ts` (a later story) calls it fresh.

**Files to create:** `src/auth.config.ts`, `src/auth.config.test.ts`

`src/auth.config.ts` exports `buildAuthConfig`.

Acceptance criteria:
- `buildAuthConfig({ secureCookies })` takes a `{ secureCookies: boolean }` argument and returns a config object with `providers`, `pages`, and `callbacks` keys.
- Provider imports are the default-export form: `import GitHub from 'next-auth/providers/github'`, `import Google from 'next-auth/providers/google'`, `import Apple from 'next-auth/providers/apple'`.
- Providers, in order: `GitHub` (bare, no options), `Google({ allowDangerousEmailAccountLinking: true })`, `Apple({ allowDangerousEmailAccountLinking: true })`. GitHub must NOT get `allowDangerousEmailAccountLinking` (unverified GitHub emails would allow account takeover). Client ids/secrets come from `AUTH_<PROVIDER>_ID/SECRET` env inference — do not pass them.
- `pages` is `{ signIn: '/sign-in' }`.
- `callbacks.signIn` is an async function receiving `{ account, profile }`: when `account?.provider === 'google'` it returns `profile?.email_verified === true`; when `account?.provider === 'apple'` it returns true only if `profile?.email_verified === true || profile?.email_verified === 'true'` (Apple sends the claim as a string in some responses); for any other provider it returns true.
- When `secureCookies` is true, the returned object also has `cookies` set to `{ state: { options: { sameSite: 'none', secure: true } }, nonce: { options: { sameSite: 'none', secure: true } }, callbackUrl: { options: { sameSite: 'none', secure: true } } }` (Apple's form_post callback is a cross-site POST; Safari drops SameSite=Lax cookies there). When false, no `cookies` key is present. Never configure a `csrfToken` cookie.
- The returned object has no `authorized` callback.
- Tests: customized providers keep user options under `provider.options`, so assert `allowDangerousEmailAccountLinking` via `providers[1].options.allowDangerousEmailAccountLinking` and `providers[2].options.allowDangerousEmailAccountLinking`, and that `providers[0].options?.allowDangerousEmailAccountLinking` is undefined. Call `callbacks.signIn` directly with crafted `{ account, profile }` objects. Assert the cookies difference between `buildAuthConfig({ secureCookies: true })` and `buildAuthConfig({ secureCookies: false })`.

**Testing:**
- Test provider order and linking options
- Test signIn callback enforces verified email
- Test secure cookie gating

## Story 2 — auth.ts builds its config from the factory

**Depends on:** Story 1

Rewire `src/auth.ts` to spread the factory output, keeping the PrismaAdapter and the existing exports. Drop the dead `authorized` callback (it gated a `/dashboard` route that does not exist; NextAuth defaults `authorized` to true).

**Files to modify:** `src/auth.ts`, and create `src/auth.test.ts`

`src/auth.ts` exports `handlers`, `auth`, `signIn`, `signOut`.

Acceptance criteria:
- Imports `{ buildAuthConfig }` from `@/auth.config` and calls `NextAuth({ adapter: PrismaAdapter(prisma), ...buildAuthConfig({ secureCookies: Boolean(process.env.VERCEL) }) })`. The secure-cookie gate keys on the `VERCEL` env var, NOT `NODE_ENV` (a local production build over plain http must not set Secure cookies).
- No `authorized` callback remains anywhere in the file.
- The four exports (`handlers`, `auth`, `signIn`, `signOut`) destructure from the `NextAuth()` return value exactly as before.
- Test setup: mock `next-auth` (default export a `vi.fn()` returning `{ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }`), mock `@auth/prisma-adapter` (`PrismaAdapter: vi.fn(() => ({}))`), mock `@/lib/db` (`prisma: {}`), and mock `@/auth.config` so `buildAuthConfig` is a `vi.fn()` returning a sentinel object such as `{ pages: { signIn: '/sign-in' }, providers: [] }`. Import `@/auth` inside the test after setting/unsetting `process.env.VERCEL` with `vi.resetModules()` between cases.
- Assert `NextAuth` was called once; capture its argument and assert it contains the sentinel `pages` value and an `adapter` key.
- Assert `buildAuthConfig` was called with `{ secureCookies: true }` when `process.env.VERCEL` is set and `{ secureCookies: false }` when it is not.

**Testing:**
- Test NextAuth receives the factory config
- Test secureCookies follows the VERCEL env var

## Story 3 — Apple client-secret generator script

Sign in with Apple requires a self-signed ES256 JWT as the client secret, rotated at most every 6 months. Create a dependency-free generator.

**Files to create:** `scripts/generate-apple-secret.mjs`, `scripts/generate-apple-secret.test.mjs`

`scripts/generate-apple-secret.mjs` exports `generateAppleClientSecret`.

Acceptance criteria:
- `generateAppleClientSecret({ privateKeyPem, teamId, keyId, clientId, now })` returns `{ token, expiresAt }` where `token` is a JWT built with only `node:crypto` (no jose/jsonwebtoken dependency): header `{ alg: 'ES256', kid: keyId }`, payload `{ iss: teamId, iat, exp, aud: 'https://appleid.apple.com', sub: clientId }` with `iat` = `now` in epoch seconds and `exp` = `iat + 13046400` (5 months — safely inside Apple's hard cap of `exp - iat <= 15777000`). `expiresAt` is the exp as an ISO date string.
- Signing uses `createSign('sha256')` (or `crypto.sign`) with `dsaEncoding: 'ieee-p1363'` — the DER default produces signatures Apple rejects. Header and payload are base64url-encoded JSON.
- When run directly (`import.meta.url` main-module check), the script parses `--key <p8 path> --team-id <id> --key-id <id> --client-id <services id>` from `process.argv`, reads the key file, prints the token on stdout and the expiry date on stderr, and exits non-zero with a usage line if any flag is missing.
- The module is never imported by app code under `src/`.
- Test setup: generate a throwaway P-256 keypair with `generateKeyPairSync('ec', { namedCurve: 'P-256' })` from `node:crypto`, pass the PEM private key, then decode the returned token's segments with `Buffer.from(seg, 'base64url')` and verify the signature with `crypto.verify` using `dsaEncoding: 'ieee-p1363'` and the public key.

**Testing:**
- Test JWT header and claims
- Test ES256 signature verifies
- Test expiry stays inside the Apple cap

## Story 4 — Env examples for Google, Apple, and the Telegram bot username

**Files to modify:** `.env.example`

Acceptance criteria:
- Adds a `# Auth.js — Google OAuth` comment block followed by `AUTH_GOOGLE_ID=""` and `AUTH_GOOGLE_SECRET=""`; the comment names the Google Cloud OAuth client and the callback path `/api/auth/callback/google`.
- Adds a `# Auth.js — Sign in with Apple` comment block followed by `AUTH_APPLE_ID=""` and `AUTH_APPLE_SECRET=""`; the comment states that `AUTH_APPLE_ID` is the Apple Services ID string (e.g. `com.example.app.web`), that the secret is a JWT generated by `scripts/generate-apple-secret.mjs` expiring within 6 months, that rotation requires a redeploy, and the callback path `/api/auth/callback/apple`.
- Adds a `# Telegram` comment block followed by `TELEGRAM_BOT_USERNAME=""` (bot username without the `@`, used to build deep links).
- New blocks follow the file's existing shape: `#` comment lines directly above a group of `NAME=""` entries with empty double-quoted values, one blank line between blocks (same as the `AUTH_GITHUB_ID` block).
- No existing line in the file is removed or altered.

**Testing:** not applicable (environment documentation file, no executable unit)

## Story 5 — SignInButtons component

Provider sign-in buttons rendered on both the landing page and the dedicated `/sign-in` page.

**Files to create:** `src/components/SignInButtons.tsx`, `src/components/SignInButtons.test.tsx`

`src/components/SignInButtons.tsx` exports `SignInButtons` as a named export and default export.

Acceptance criteria:
- An async server component, no props. Imports `{ signIn }` from `@/auth`.
- Renders three `<form>` elements, each with an inline `'use server'` async action calling `signIn('google')`, `signIn('apple')`, and `signIn('github')` respectively (the same inline-action pattern as the existing landing page form).
- Google button: type submit, accessible name "Sign in with Google", white background, 1px `#747775` border, `#1f1f1f` text, at least 40px tall, containing an inline SVG of the official four-color Google "G" mark (no external image).
- Apple button: type submit, accessible name "Sign in with Apple", solid black background, white text, at least 44px tall, containing an inline white Apple-logo SVG.
- GitHub button sits below a visual "or" divider as a plain text-style button with accessible name "Continue with GitHub".
- Test setup: mock `@/auth` with `{ signIn: vi.fn() }`; render the resolved element via `render(await SignInButtons())`.

**Testing:**
- Test renders Google and Apple buttons by name
- Test renders GitHub fallback under a divider

## Story 6 — Dedicated /sign-in page

**Depends on:** Story 5

**Files to create:** `src/app/sign-in/page.tsx`, `src/app/sign-in/page.test.tsx`

`src/app/sign-in/page.tsx` exports `SignInPage` as the default export.

Acceptance criteria:
- Async server component receiving `{ searchParams }` where `searchParams` is a Promise resolving to `{ error?: string }` (await it before use).
- Imports `{ auth }` from `@/auth` and `{ redirect }` from `next/navigation`. When `(await auth())?.user?.id` exists, calls `redirect('/')` before rendering anything.
- Signed out: renders a centered card (white background, `#e4e4e7` border, rounded corners matching the house style) containing the "Nutrition Coach" wordmark and the `SignInButtons` component (default import from `@/components/SignInButtons`).
- Error copy is allowlist-mapped, never echoed raw: `OAuthAccountNotLinked` → "That email is already registered through a different provider — use the one you first signed in with."; `AccessDenied` → "Sign-in was refused for this account."; `OAuthCallbackError` and `Configuration` → "Something went wrong during sign-in — please try again."; any other non-empty error value → the same generic line. No error param → no error line rendered.
- Test setup: mock `@/auth` (`auth: vi.fn()`), mock `next/navigation` (`redirect: vi.fn(() => { throw new Error('redirected') })`), mock `@/components/SignInButtons` to render a placeholder div.

**Testing:**
- Test redirects when authenticated
- Test renders sign-in buttons when signed out
- Test maps unknown error values to generic copy

## Story 7 — Landing page signed-out state uses SignInButtons

**Depends on:** Story 5

Replace the single GitHub form in the signed-out branch of the home page with the shared provider buttons, so visitors sign in without an extra hop.

**Files to modify:** `src/app/page.tsx`, `src/app/page.test.tsx`

Acceptance criteria:
- The signed-out branch renders `SignInButtons` (default import from `@/components/SignInButtons`) in place of the current inline `signIn('github')` form; the surrounding hero copy and layout are otherwise unchanged.
- The signed-in branch (dashboard data fetching and `HomeClient` render) is untouched.
- The page no longer contains a direct `signIn('github')` call.
- Test setup: extend the existing `page.test.tsx` mocks with a mock of `@/components/SignInButtons` rendering a recognizable placeholder; keep all existing signed-in assertions passing unchanged.

**Testing:**
- Test signed-out branch renders SignInButtons
- Test signed-in dashboard render is unchanged

## Story 8 — NavBar signed-out icon links to /sign-in

The signed-out auth icon currently submits a `signIn('github')` form. Point it at the sign-in page instead (a 36px monochrome icon cannot carry Google's four-color brand mark, so the icon navigates rather than signs in directly).

**Files to modify:** `src/components/NavBar.tsx`, `src/components/NavBar.test.tsx`

`src/components/NavBar.tsx` exports `NavBar` as the default export (unchanged).

Acceptance criteria:
- Signed out: the form wrapping the sign-in icon button is replaced by a `Link` (from `next/link`) with `href="/sign-in"`, `aria-label="Sign in"`, the same `TabIcon` glyph and the same styling classes as today.
- Signed out: no `signIn` import remains in the file if unused elsewhere.
- Signed in: the sign-out form/button is unchanged.
- Test setup: reuse the file's existing session mocking pattern; assert the signed-out state renders a link (role `link`, accessible name "Sign in") pointing at `/sign-in` and no longer renders a sign-in form button.

**Testing:**
- Test signed-out renders a link to /sign-in
- Test signed-in still renders the sign-out button

## Story 9 — TelegramChat and TelegramLinkToken models

Schema for per-user Telegram linking: one chat per user, one user per chat, plus a one-time link token.

**Files to modify:** `prisma/schema.prisma`

Acceptance criteria:
- New model `TelegramChat`: `id String @id @default(cuid())`, `chatId String @unique`, `userId String @unique`, `user User @relation(fields: [userId], references: [id], onDelete: Cascade)`, `createdAt DateTime @default(now())`.
- New model `TelegramLinkToken`: `token String @id`, `userId String @unique`, `user User @relation(fields: [userId], references: [id], onDelete: Cascade)`, `expiresAt DateTime`, `createdAt DateTime @default(now())`.
- The `User` model gains the two back-relation fields (`telegramChat TelegramChat?`, `telegramLinkToken TelegramLinkToken?`).
- `npx prisma validate` passes and `npx prisma generate` succeeds.
- The `userId @unique` on `TelegramChat` (one Telegram chat per user) is a deliberate launch constraint — keep it.

**Testing:** not applicable (Prisma schema definition, validated by prisma validate)

## Story 10 — telegramLink library

**Depends on:** Story 9

Token minting, atomic consumption, chat resolution, and disconnect — the sessionless core the webhook and UI both use.

**Files to create:** `src/lib/telegramLink.ts`, `src/lib/telegramLink.test.ts`

`src/lib/telegramLink.ts` exports `createLinkToken`, `consumeLinkToken`, `resolveUserByChat`, `disconnectUser`.

Acceptance criteria:
- Imports `{ prisma }` from `@/lib/db` and `{ randomBytes }` from `node:crypto`.
- `createLinkToken(userId)`: token = `randomBytes(16).toString('hex')` (32 chars — Telegram's `/start` payload caps at 64), expiry 15 minutes from now; upserts the `telegramLinkToken` row by `userId` (a user regenerating replaces their old token); returns `{ token, expiresAt }`.
- `consumeLinkToken(token, chatId)`: returns null immediately when the token fails `/^[0-9a-f]{32}$/i` (the text after `/start` is arbitrary user input). Otherwise runs ONE `prisma.$transaction(async (tx) => ...)`: (1) `tx.telegramLinkToken.deleteMany({ where: { token, expiresAt: { gt: new Date() } } })` and bail out returning null unless `count === 1` (atomic consume — Telegram redelivers on timeout); capture the token's `userId` by reading the row first inside the transaction before deleting, or delete-by-token returning-count plus a prior `findUnique` inside the same transaction; (2) `tx.telegramChat.deleteMany({ where: { OR: [{ chatId }, { userId }] } })` — "phone wins": a chat already linked to another user is rebound to whoever proves control of it, and a user relinking from a new chat drops their old link; (3) `tx.telegramChat.create({ data: { chatId, userId } })`; (4) return the user row via `tx.user.findUnique({ where: { id: userId } })`.
- `resolveUserByChat(chatId)`: `prisma.telegramChat.findUnique({ where: { chatId }, include: { user: true } })`, returns the user or null.
- `disconnectUser(userId)`: `prisma.telegramChat.deleteMany({ where: { userId } })`, returns the deleted count.
- Test setup: mock `@/lib/db` with a `prisma` object whose `$transaction` is `vi.fn(async (fn) => fn(txMock))` where `txMock` carries `telegramLinkToken` and `telegramChat` and `user` method mocks; drive `deleteMany` counts per case.

**Testing:**
- Test createLinkToken upserts a 32-char token
- Test consumeLinkToken rebinds an already-linked chat
- Test consume rejects expired or malformed tokens

## Story 11 — analyzeMeal core library

Move the vision analysis out of the server action into a plain library function so the Telegram webhook stops depending on a publicly-invokable action.

**Files to create:** `src/lib/analyzeMeal.ts`, `src/lib/analyzeMeal.test.ts`

`src/lib/analyzeMeal.ts` exports `analyzeMeal`.

Acceptance criteria:
- `analyzeMeal(photoUrl, hint?)` contains the exact current logic of `src/app/actions/analyzeMeal.ts` (vision prompt build including the optional caption hint as ground truth, LLM call, brace-slice JSON extraction, zod schema with rounded non-negative integers) with no `'use server'` directive — moved, not rewritten.
- Same imports as the action uses today for the LLM call and zod, updated only for the new location.
- The existing tests in `src/app/actions/analyzeMeal.test.ts` are the behavioral spec: port their cases (successful parse, prose-wrapped JSON tolerated, invalid shape rejected, hint threading) to `src/lib/analyzeMeal.test.ts` against the lib import path, keeping the same mock strategy for the LLM boundary.

**Testing:**
- Test returns parsed meal analysis with hint threading
- Test tolerates prose-wrapped JSON
- Test rejects an invalid analysis shape

## Story 12 — analyzeMeal action becomes an authenticated wrapper

**Depends on:** Story 11

The server action is a public POST endpoint; today it has no auth check at all, so anyone can burn vision-LLM budget through it. Gate it and delegate to the lib.

**Files to modify:** `src/app/actions/analyzeMeal.ts`, `src/app/actions/analyzeMeal.test.ts`

`src/app/actions/analyzeMeal.ts` exports `analyzeMeal`.

Acceptance criteria:
- Keeps `'use server'` as the first line.
- Imports `{ auth }` from `@/auth` and `{ analyzeMeal as analyzeMealCore }` from `@/lib/analyzeMeal`.
- The exported `analyzeMeal(photoUrl, hint?)` first awaits `auth()`; when `session?.user?.id` is absent it throws `new Error('Unauthorized')` before any LLM work; otherwise it returns `analyzeMealCore(photoUrl, hint)`.
- No vision/zod logic remains in the action file.
- Test setup: mock `@/auth` (`auth: vi.fn()`) and `@/lib/analyzeMeal` (`analyzeMeal: vi.fn()`); replace the old behavioral tests (now living in the lib's test file) with wrapper-level tests.

**Testing:**
- Test throws Unauthorized when signed out
- Test delegates to the core lib when signed in

## Story 13 — Telegram webhook multi-user rewrite

**Depends on:** Story 10, Story 11

Replace the single-user chat-id gate with per-user resolution, `/start` linking, `/disconnect`, and hardened callbacks. The webhook secret check remains the sole authentication.

**Files to modify:** `src/app/api/telegram/route.ts`, `src/app/api/telegram/route.test.ts`

`src/app/api/telegram/route.ts` exports `POST` and `maxDuration` (unchanged).

Acceptance criteria:
- Imports gain `{ consumeLinkToken, resolveUserByChat, disconnectUser }` from `@/lib/telegramLink`, and `analyzeMeal` now comes from `@/lib/analyzeMeal` (named import `{ analyzeMeal }`) instead of the server action. All `process.env.TELEGRAM_CHAT_ID` comparisons are deleted.
- Every `message` and `callback_query` whose chat has `type !== 'private'` is ignored with `{ ok: true, ignored: true }` (groups break the chat-equals-identity model). For an ignored callback still call `answerCallbackQuery(cb.id)` first so the tapper's client stops spinning.
- Callback branch: additionally require `String(cb.from?.id) === String(cb.message?.chat?.id)`; resolve the user via `resolveUserByChat(cbChatId)` (unknown chat → answer the callback, ignore); the confirm `updateMany` and discard `deleteMany` where-clauses become `{ id: mealId, userId: user.id, confirmed: false }`; when the returned `count` is 0 (already handled or forged `callback_data`) reply "That meal's no longer pending." instead of "Logged ✓" / the discard copy.
- Text `/start <payload>` in a private chat: `consumeLinkToken(payload, chatId)`; on success reply "Connected to the account for <user.email> — not you? Send /disconnect." followed by a one-line coach greeting; on null reply "That link expired — get a fresh one from the app's Targets page." Bare `/start` from a linked chat replies with a short static greeting; from an unknown chat it falls through to the connect instructions. Match commands with `/^\/start(\s|$)/` and handle them BEFORE the coachReply branch — a command must never reach the LLM.
- Text `/disconnect` from a linked chat: `disconnectUser(user.id)` and reply "Disconnected — this chat is no longer linked."
- Unknown chat (no `TelegramChat` row), private, plain text: reply once per message with a static instruction string telling them to connect from the app's Targets page (no LLM call, ever, for unknown chats). Unknown-chat photos and any non-text update: silently ignore with `{ ok: true, ignored: true }`.
- Known chat: the existing photo flow (download, blob put, caption as hint, pending meal + inline keyboard) and text flow (`coachReply`) run against the user returned by `resolveUserByChat`, not `findFirst`.
- Tests must cover, beyond the named bullets: group-chat updates ignored, `/disconnect`, bare `/start` static greeting, expired-token copy, unknown-chat photo silently ignored, and `cb.from.id` mismatch ignored. Reuse the file's existing mock scaffolding for `@/lib/telegram`, blob, prisma, and coachReply; token fixtures must be 32 lowercase hex chars.

**Testing:**
- Test start token links and names the account
- Test unknown chat gets the static connect reply
- Test callback is user-scoped and count-checked

## Story 14 — Cron per-user Telegram delivery

**Depends on:** Story 9

Send the daily check-in to every linked chat instead of the single `TELEGRAM_CHAT_ID`, and delete the route's corrupted local send helper (its header name contains a stray control character, so every cron send currently fails at the fetch layer).

**Files to modify:** `src/app/api/cron/route.ts`, `src/app/api/cron/route.test.ts`

`src/app/api/cron/route.ts` exports `GET` and `maxDuration`.

Acceptance criteria:
- `export const maxDuration = 300` is set.
- The local `sendTelegramMessage` helper in the route file is deleted; the route imports `{ sendTelegramMessage }` from `@/lib/telegram`.
- The user loop becomes `prisma.telegramChat.findMany({ include: { user: true } })`; each linked chat gets one check-in built from its own user (existing per-user prompt logic with `nowLine()` retained), sent to that row's `chatId`. Users without a linked chat are skipped entirely. `process.env.TELEGRAM_CHAT_ID` is no longer read.
- Chats are processed in batches of 5 via `Promise.allSettled` (sequential LLM calls would exceed the function duration once users grow); a rejected promise increments `failed` without aborting the batch or the loop.
- The response stays `{ ok, sent, failed }`.
- Tests must drive a multi-chat fixture asserting one send per linked chat with per-user content, a mid-batch failure that still delivers the remaining chats, and that the mocked `@/lib/telegram` sender is what delivers (no local fetch fallback remains).

**Testing:**
- Test sends one check-in per linked chat
- Test a failed send counts without aborting others
- Test delivery goes through the shared telegram lib

## Story 15 — disconnectTelegram server action

**Depends on:** Story 10

**Files to create:** `src/app/actions/disconnectTelegram.ts`, `src/app/actions/disconnectTelegram.test.ts`

`src/app/actions/disconnectTelegram.ts` exports `disconnectTelegram`.

Acceptance criteria:
- `'use server'` first line; imports `{ auth }` from `@/auth`, `{ disconnectUser }` from `@/lib/telegramLink`, and `{ revalidatePath }` from `next/cache`.
- `disconnectTelegram()` awaits `auth()`; without `session?.user?.id` it throws `new Error('Unauthorized')`; otherwise calls `disconnectUser(session.user.id)`, then `revalidatePath('/targets')`, and returns `{ ok: true }`.
- Test setup: mock `@/auth`, `@/lib/telegramLink`, and `next/cache`.

**Testing:**
- Test throws Unauthorized when signed out
- Test disconnects and revalidates targets

## Story 16 — ConnectTelegram component

**Depends on:** Story 15

**Files to create:** `src/components/ConnectTelegram.tsx`, `src/components/ConnectTelegram.test.tsx`

`src/components/ConnectTelegram.tsx` exports `ConnectTelegram` as a named export and default export.

Acceptance criteria:
- A server component taking props `{ linked: boolean; linkUrl: string | null }`.
- A card section titled "Telegram" in the house style (white, `#e4e4e7` border, rounded), explaining in one line that connecting lets the coach chat over Telegram.
- When `linked` is false and `linkUrl` is set: renders an anchor with accessible name "Connect Telegram" and `href={linkUrl}`, styled as the emerald primary button, plus a muted line that the link expires in 15 minutes.
- When `linked` is true: renders a "Connected" state line and a form whose action is `disconnectTelegram` (named import from `@/app/actions/disconnectTelegram`) with a submit button accessible-named "Disconnect".
- Test setup: mock `@/app/actions/disconnectTelegram`.

**Testing:**
- Test renders the deep link when unlinked
- Test renders connected state with a disconnect button

## Story 17 — Targets page hosts the Telegram connect section

**Depends on:** Story 10, Story 16

**Files to modify:** `src/app/targets/page.tsx`, `src/app/targets/page.test.tsx`

Acceptance criteria:
- After the existing `dailyTarget` fetch, the page queries `prisma.telegramChat.findUnique({ where: { userId: session.user.id } })`.
- When no chat is linked, it calls `createLinkToken(session.user.id)` (named import from `@/lib/telegramLink`) and builds `linkUrl` by concatenating four pieces in order: the literal `https://t.me/`, the value of the `TELEGRAM_BOT_USERNAME` env var, the literal `?start=`, and the token. Regenerating on each render is fine — the token upserts per user.
- Renders `ConnectTelegram` (default import from `@/components/ConnectTelegram`) below the `DailyTargetForm`, passing `linked` and `linkUrl` (null when linked).
- The signed-out branch and the target form behavior are unchanged.
- Test setup: extend the existing page test mocks with `@/lib/telegramLink` (`createLinkToken: vi.fn()`), the `telegramChat.findUnique` prisma method, `process.env.TELEGRAM_BOT_USERNAME = 'testbot'`, and a mock of `@/components/ConnectTelegram` that surfaces its props.

**Testing:**
- Test unlinked user gets a tokened deep link
- Test linked user sees the connected state

## Ops checklist (not a story — Thomas + assistant)

- Google Cloud: consent screen External + In production; OAuth Web client with redirect URIs `https://nutrition-coach-omega.vercel.app/api/auth/callback/google` and `http://localhost:3000/api/auth/callback/google`; `AUTH_GOOGLE_ID/SECRET` → Vercel Production (Sensitive) + `.env.local`.
- Apple Developer: App ID with Sign in with Apple; Services ID (= `AUTH_APPLE_ID`) associated with the App ID as primary, domain `nutrition-coach-omega.vercel.app`, return URL `https://nutrition-coach-omega.vercel.app/api/auth/callback/apple` (no localhost/previews); download the `.p8` key once; run `scripts/generate-apple-secret.mjs`; `AUTH_APPLE_SECRET` → Vercel Production; rotation needs a redeploy; calendar +4.5 months.
- BotFather: Group Privacy ON, groups disabled. Add `TELEGRAM_BOT_USERNAME=myhumble_fitness_coach_bot` to Vercel + `.env.local`.
- After release: owner smoke — Google sign-in links to the existing user (Account table gains a `google` row, same userId); Apple sign-in **in Safari** choosing "Share My Email"; Connect Telegram → `/start` → meal message → `/disconnect` → relink; stranger account isolation check; cron trigger sends exactly one message per linked chat and sends succeed. Remove `TELEGRAM_CHAT_ID` env once confirmed unused.
- Deferred to next epic: stranger onboarding polish, unknown-chat throttling (`lastNudgedAt`), per-user target defaults, admin view, rate limits, removing GitHub, Apple-secret expiry warning via cron.
