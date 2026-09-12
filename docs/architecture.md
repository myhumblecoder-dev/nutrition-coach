# Architecture

Not a tour of the codebase — the decisions that are load-bearing, non-obvious,
or expensive to rediscover. Each points at the code that implements it.

## The model, and the rate table that has to agree with it

`LLM_MODEL` does two jobs, and nothing enforces that they stay consistent:

1. `src/lib/llm.ts` passes it straight to the Anthropic SDK as the model.
2. `src/lib/limits.ts` looks it up in `RATES` to price spend.

A name valid at the API but absent from `RATES` — a dated identifier like
`claude-3-5-haiku-20241022` — is accepted by (1) and falls through (2) to
`FALLBACK_RATE` of $5/$25 per MTok. Every call is then priced at five times
Haiku, and the only symptom is users meeting the monthly ceiling at roughly a
quarter of their intended allowance, told they have spent money they have not.
It looks like a bug in the caps rather than in a lookup.

Erring dear is deliberate: under-counting spend is the one direction a cost
ceiling must not be wrong in. `rates()` warns once per process when it falls
through, because the silence was the real defect.

Adding a model means adding it to `RATES` in the same change.

### Do not mark a non-secret Sensitive

`LLM_MODEL` and `LLM_PROVIDER` were both created Sensitive in Vercel. That
type is **write-only**: the value can be edited or rotated but never read
back, not by `vercel env pull` and not in the dashboard. `vercel env pull`
writes the literal string `[SENSITIVE]` in its place, which is eleven
characters and parses as a model name that is in no rate table.

Neither is a credential. Nothing was protected, and the cost was that "which
model is production actually running?" became unanswerable without changing
it — while the fallback silently priced every call at five times Haiku.

The way out is to edit it to a known value, or delete and recreate it as a
plain variable so it can be read again. The other check that needs nothing at
all is the Anthropic console, which breaks usage down by model and reports
what was actually called rather than what someone believes was configured.

Reserve Sensitive for things that would do damage if read: API keys, the auth
secret, the APNs private key, webhook secrets.

## What things actually cost

Measured against production, 2026-09-12, at Haiku's $1/$5:

| | |
|---|---|
| chat turn | **$0.0026** (≈1,700 in / 175 out) |
| vision call | **$0.0028** (n=1, indicative) |
| user at full daily caps | **$3.60/month** |
| proceeds at $7.99 after Apple's 15% | **$6.79** |

A chat turn is **two model calls** — the reply and the extraction — and
`attributeTokens` accumulates both into one `UsageEvent`, so the per-turn
figure above is the whole turn. Anything that reads one call's tokens as the
turn's cost undercounts by about half; that bug has been fixed once already.

The **daily caps are the cost control**. `MONTHLY_SPEND_CEILING_USD` defaults
to $5, which full caps never reach at $3.60, so it is an anomaly catcher
rather than a budget.

Re-measure with `npm run cost` after any prompt change. The prompts grew three
times on 2026-09-11 alone, and an estimate made before that was low by 80%.

## Extraction runs before the reply

`coachReply` extracts first, then generates. The order is load-bearing.

Replying first meant the model said "Logged." because a statement gets a
statement back, with no idea whether a row had been written — so "log 40g of
fat" got a confident confirmation and stored nothing, fat being a property of
a meal. `storageNote` now tells the coach what was actually written, and
forbids claiming a save that did not happen.

The day's totals are read **after** extraction too, or the prompt says "0 cal
today" and "1 meal recorded" in the same breath.

A failed `generate` therefore leaves an extracted row with no exchange in the
chat history. Accepted: the row carries its own `sourceText` — the user's
words, which is what the feed shows — so the meal explains itself. Persisting
the user message first would swap an unexplained row for a duplicated one on
the retry.

## `foodItems` is a JSON column, and that is on purpose

`MealEntry.foodItems` holds a JSON array rather than a related table. It has
absorbed `fat`, `fatSource` and `processingGroup` without a single migration.

The cost is that **every reader must be tolerant**. Rows written by several
generations of prompt coexist, most name no processing group, and some predate
fat entirely. A malformed one costs a ring its colour, never the dashboard.
See `fatItemsFromJson`, `processedItemsFromJson`, `todayContext.namesIn`.

The trap: `foodItemSchema` in `src/lib/meals.ts` is a plain `z.object`, so
unknown keys are **stripped**, and `logMealForUser` writes the parsed value.
A field added to the prompt but not to that schema is silently dropped on the
main logging path. `processingGroup` was lost this way and the gauge could
only ever be lit by chat-extracted meals.

## Entitlement is the clock, not Apple's status string

`tierOf` in `src/lib/entitlement.ts` decides from `expiresAt` and the
environment, not from what Apple last said. A renewal notification that never
arrives would otherwise strand a paying user forever.

`APPLE_IAP_ENVIRONMENT` must match the transactions being verified. A mismatch
reads as `lapsed` — deliberately, so a sandbox receipt can never entitle a
real account. It also means **the environment must be swapped before
enforcement goes on**.

`APPLE_APP_APPLE_ID` is required by Apple's verifier in production and
**rejected in sandbox**. Set it for production, unset it to test.

`SUBSCRIPTIONS_ENFORCED` gates everything and is opt-in for the same reason
attestation is: the server has to ship before the client can buy. Turning it
on before a purchase is possible locks out every account with no way to pay.

## Family Sharing is permanent and shapes the data model

App Store Connect cannot turn Family Sharing off once enabled. Up to six
people share one purchase, and every family member's transaction carries the
**buyer's** `originalTransactionId`.

So that column is **not unique**, and `syncSubscription` enforces the real rule
instead: at most one `PURCHASED` row per id, with `FAMILY_SHARED` rows allowed
alongside and capped at five. This is safe because Apple signs
`inAppOwnershipType` — a receipt moved to another account arrives as
`PURCHASED` and still collides.

Notifications scope by ownership too, or a withdrawn family share revokes the
person paying.

Break-even at full caps is about **1.9 users per subscription**, which is below
six. Realistic usage is far below caps, but a change that raises per-user cost
should be checked against this.

## Every user's day is their own

`startOfToday(now, timeZone)` and `dayBounds` resolve against the user's
timezone, stored per account and settable in Settings. Today's rings, the daily
caps, and the fresh-each-morning chat all turn over at the user's midnight,
not the server's.

The anchor nudges from noon UTC until the local date matches; a naive noon
anchor was wrong at UTC+12.

## Notifications: local for the predictable, push for the derived

The three daily meal reminders are **local** (`UNCalendarNotificationTrigger`),
so they cannot arrive at the wrong hour and cost nothing to send. The weekly
check-in is **server push**, because the server decides when it is due.

There is **no notification tap routing** — no `UNUserNotificationCenterDelegate`
anywhere in the iOS target — so tapping any notification just opens the app
wherever it was. Worth knowing before adding a notification that should land
somewhere specific.

## Schema changes go out by `db push`

There is no migrations directory. CD runs `prisma db push --accept-data-loss`
on deploy to `main`. Additive changes are safe; anything destructive needs
thinking about before it is merged, because nothing will stop it.

## The iOS project is generated

`ios/project.yml` is the source of truth. The `.xcodeproj` and `.xcscheme` are
produced by XcodeGen and the project file is gitignored, so anything done in
Xcode's UI to project settings is wiped by the next `xcodegen generate`. Scheme
configuration — the StoreKit file, test settings — belongs in `project.yml`.

Build numbers come from `github.run_number` of `ios-cd.yml`, so they are not
sequential with anything else and cannot be reused.

## Prompt discipline

Numbers are computed in code and handed to the model. The model narrates; it
does not derive. A confidently wrong trend in a health app is worse than no
trend, and this is why extraction is schema-validated, why `storageNote` only
claims what was written, and why the planned pattern engine (#308) computes in
SQL.

Only what changes per turn goes in the chat prompt. Long-run patterns belong
in a periodically-rebuilt block, not re-derived from raw rows every message.
