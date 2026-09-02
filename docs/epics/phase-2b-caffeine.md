# Phase 2b — Caffeine replaces alcohol in the recovery pillar

Alcohol was never the useful third recovery signal for this user; caffeine is. This epic swaps the `alcohol` recovery kind for `caffeine` (measured in **milligrams**), adds a pharmacokinetic estimate of how much is still in the user's system and how long until it stops mattering, and teaches the coach to talk about it.

Production has zero `alcohol` rows (verified 2026-09-02), so this is a clean swap: no data migration, and `RecoveryEntry.kind` is a plain `String` column, so no schema change either.

Two facts every story depends on: caffeine's mean elimination half-life is **5 hours**, and a load below **25 mg** is treated as negligible (no meaningful effect).

## Story 1 — Caffeine decay library

The pure calculation, with no database or LLM involvement.

**Files to create:** `src/lib/caffeine.ts`, `src/lib/caffeine.test.ts`

`src/lib/caffeine.ts` exports `caffeineStatus`, `CAFFEINE_HALF_LIFE_HOURS`, `NEGLIGIBLE_MG`.

Acceptance criteria:
- `CAFFEINE_HALF_LIFE_HOURS` is the number `5`. `NEGLIGIBLE_MG` is the number `25`.
- `caffeineStatus(doses, now)` takes an array of `{ mg: number; at: Date }` and a `Date`, and returns `{ totalMg: number; currentMg: number; hoursUntilNegligible: number }`.
- `totalMg` is the sum of every dose's `mg`, rounded to the nearest integer.
- `currentMg` is the sum over doses of `mg * Math.pow(0.5, hoursElapsed / CAFFEINE_HALF_LIFE_HOURS)` where `hoursElapsed` is `(now - at)` in hours, rounded to the nearest integer. A dose with a future `at` (clock skew) contributes its full `mg` and is never amplified — clamp `hoursElapsed` to a minimum of `0`.
- `hoursUntilNegligible` treats the remaining load as one decaying pool: when `currentMg <= NEGLIGIBLE_MG` it is `0`; otherwise it is `Math.log2(currentMg / NEGLIGIBLE_MG) * CAFFEINE_HALF_LIFE_HOURS`, rounded to one decimal place.
- An empty `doses` array returns `{ totalMg: 0, currentMg: 0, hoursUntilNegligible: 0 }`.
- The module imports nothing from the app — no prisma, no llm, no next.

**Testing:**
- Test one dose decays by half over five hours
- Test multiple doses accumulate
- Test an empty list is all zeroes

## Story 2 — Extraction records caffeine in milligrams

**Files to modify:** `src/lib/extraction.ts`, `src/lib/extraction.test.ts`

`src/lib/extraction.ts` exports `buildExtractionPrompt`, `parseHealthFacts`, `recordHealthFacts`, `extractHealthFacts`.

Acceptance criteria:
- The recovery item schema's `kind` enum becomes `z.enum(['sleep', 'water', 'caffeine'])` — `alcohol` is removed entirely.
- In `buildExtractionPrompt`, the recovery key description becomes `"recovery" (array of {"kind": "sleep"|"water"|"caffeine", "value": number} — sleep in hours, water in liters, caffeine in milligrams)`.
- The prompt gains an explicit caffeine-estimation instruction, because users name drinks rather than milligrams. Caffeine is an exception to the everything-else-is-explicit-only rule, stated in the prompt as: caffeine may be ESTIMATED from the drink the user describes, using roughly brewed coffee 95 mg per cup, espresso 65 mg per shot, black tea 47 mg, green tea 28 mg, energy drink 80 mg, decaf 3 mg; multiply by the number of servings the user states.
- The explicit-only sentence that currently covers "training, recovery, mood, measurement" is reworded so it no longer contradicts the caffeine estimation rule — recovery's sleep and water stay explicit-only, caffeine may be estimated.
- No other behaviour changes: `lenientArray` caps, the seeds block, and every other key stay exactly as they are.
- Tests must include a `parseHealthFacts` case asserting a `caffeine` recovery item survives, and a case asserting an `alcohol` kind is now rejected (dropped as an invalid item, leaving valid siblings intact).

**Testing:**
- Test a caffeine recovery item parses
- Test an alcohol kind is rejected
- Test the prompt documents milligram estimation

## Story 3 — getWeek reports caffeine status

**Depends on:** Story 1

**Files to modify:** `src/app/actions/getWeek.ts`, `src/app/actions/getWeek.test.ts`

`src/app/actions/getWeek.ts` exports `getWeek`.

Acceptance criteria:
- Imports `{ caffeineStatus }` from `@/lib/caffeine`.
- The returned `recovery` object drops `alcoholDrinks` and gains `caffeine`, whose value is either `null` when today has no caffeine rows, or the object returned by `caffeineStatus`.
- The doses passed to `caffeineStatus` are today's `RecoveryEntry` rows with `kind === 'caffeine'`, mapped to `{ mg: entry.value, at: entry.loggedAt }`, with `new Date()` as `now`.
- `sleepHours` and `waterLiters` keep their current behaviour and lookups exactly.
- Test setup: the file already mocks `@/lib/db` and `@/auth`; add a `vi.mock('@/lib/caffeine')` so the action's own wiring is asserted rather than the maths, and assert the doses argument shape.

**Testing:**
- Test caffeine rows become doses for the calculator
- Test a day with no caffeine yields null

## Story 4 — RecoveryCard shows caffeine instead of alcohol

**Depends on:** Story 3

**Files to modify:** `src/components/RecoveryCard.tsx`, `src/components/RecoveryCard.test.tsx`

`src/components/RecoveryCard.tsx` exports `RecoveryCard` as the default export.

Acceptance criteria:
- The `recovery` prop type replaces `alcoholDrinks: number | null` with `caffeine: { totalMg: number; currentMg: number; hoursUntilNegligible: number } | null`.
- The row label "Alcohol" becomes "Caffeine".
- When `caffeine` is `null`, the row keeps the existing green check treatment and reads `none logged`.
- When `caffeine` is present, the row's value reads the current load in milligrams followed by the wear-off estimate, in the form `120 mg · ~4.2h left` (current milligrams, then the hours until negligible to one decimal). When `hoursUntilNegligible` is `0`, it reads `120 mg · worn off` instead.
- Sleep, water, mood, and the sparkline are untouched.

**Testing:**
- Test the caffeine row renders load and hours
- Test a worn-off level renders without an hours figure
- Test no caffeine renders the none-logged state

## Story 5 — HomeClient passes the caffeine shape through

**Depends on:** Story 3

**Files to modify:** `src/app/HomeClient.tsx`, `src/app/HomeClient.test.tsx`

`src/app/HomeClient.tsx` exports `HomeClient` as the default export.

Acceptance criteria:
- The inline `recovery` type in the component's props replaces `alcoholDrinks: number | null` with `caffeine: { totalMg: number; currentMg: number; hoursUntilNegligible: number } | null`, matching what `getWeek` now returns.
- No other change: `recovery` is still passed straight through to `RecoveryCard`.
- Test setup: the file's existing test already builds a `week` fixture; update that fixture's `recovery` to the new shape and assert the dashboard still renders.

**Testing:**
- Test the dashboard renders with a caffeine recovery shape

## Story 6 — The coach knows the user's caffeine level

**Depends on:** Story 1

**Files to modify:** `src/lib/chat.ts`, `src/lib/chat.test.ts`

`src/lib/chat.ts` exports `coachReply`.

Acceptance criteria:
- Imports `{ caffeineStatus }` from `@/lib/caffeine`.
- After the existing measurement context block, `coachReply` queries today's `RecoveryEntry` rows with `kind === 'caffeine'` for the user, maps them to `{ mg, at }`, and calls `caffeineStatus`.
- When `currentMg` is greater than zero, the coach persona gains a line of the form `Caffeine: about 120 mg still active from 250 mg today, roughly 4.2 hours until it wears off. Factor this into sleep and training advice when relevant.` built from the returned numbers.
- When there are no caffeine rows today, no caffeine line is added to the prompt.
- Every other part of the prompt, the persona, the history, the message persistence, and the extraction call stay exactly as they are.
- Test setup: the file already mocks `@/lib/db`, `@/lib/llm`, and `@/lib/extraction`; add the `recoveryEntry.findMany` mock and capture the prompt passed to `generate` to assert the line's presence or absence.

**Testing:**
- Test the prompt carries the active caffeine line
- Test no caffeine today leaves the prompt clean

## Ops notes (not a story)

- No Prisma migration: `RecoveryEntry.kind` is a free-text `String`, and production holds zero `alcohol` rows.
- After release, tell the coach something like "I had two coffees this morning" and confirm a `caffeine` recovery row appears with an estimated milligram value, and that the dashboard's Caffeine row counts down over the day.
- Deferred: a caffeine cutoff-time warning ("stop drinking coffee after 2pm to protect sleep") and charting caffeine against sleep quality on the Trends page.
