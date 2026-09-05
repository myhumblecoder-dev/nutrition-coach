# App Store listing — Roughly

The copy that goes into App Store Connect. Kept in the repo so a change to what
the app does and a change to what the listing claims land in the same diff.

Field lengths are Apple's hard limits; the counts below are the current text.

## Name (30)

```
Roughly Fitness Coach
```

21 characters. The App Store name, which is **not** the home-screen name:
`CFBundleDisplayName` stays "Roughly" so the icon caption does not truncate.
Two names is deliberate, not drift — the store needs to be findable, the home
screen needs to be short.

## Subtitle (30)

```
Stop counting. Start talking.
```

29 characters. "A coach who asks, not counts" was the earlier draft, written when
the app was called just "Roughly". It stopped working the moment the name ended
in "Coach": a subtitle that repeats a word already in the name spends half the
budget saying nothing. This one says what the app actually does instead.

## Promotional text (170)

Editable without a new build, so this is where a change of emphasis goes.

```
Tell it what you ate. It logs the meal, remembers last week, and asks how this one actually went. No forms, no gram-by-gram entry, no pretending the numbers are exact.
```

167 characters, on one line. Kept unwrapped because the hard line breaks in the
earlier draft would have pasted into App Store Connect as literal breaks, and
because wrapping is what hid the fact that it was 186 characters — sixteen over
the limit — in a field whose whole constraint is its length.

## Description (4000)

```
Roughly is a diet and training coach that starts from an uncomfortable fact:
nobody knows exactly how many calories are on their plate. The label is a legal
tolerance, not a measurement. The database entry is somebody else's recipe. The
gram-by-gram log you kept for three days was a guess with more decimal places.

So Roughly does not ask you to count. You tell it what you ate, the way you
would tell a person, and it works the rest out — and it says plainly that the
numbers are estimates, because they are.

WHAT IT DOES

• Log by talking. "Chicken burrito bowl, no rice, and I lifted this morning" is
  a complete entry. No forms, no barcodes, no serving sizes to look up. The
  conversation is the log.

• A coach that remembers. It has your history — what you ate, how you trained,
  what you said last week — and answers in that context rather than reciting
  generic advice. It is brisk and a little dry, and it is never on the side of
  the food label.

• Weekly check-ins. Four questions, in your own words: body, strength, sleep,
  mood. None of them ask for a number, because the point is what you noticed,
  not what a scale says.

• A review that keeps the receipts. Every week is stored next to the words you
  actually used, not just the app's summary of them. No charts, no trend lines
  — a computed trend would be the app asserting a precision it does not have.

WHAT IT DOES NOT DO

No streaks. No badges. No shaming you for a Tuesday. No advertising, no
analytics SDK, no selling your data to anybody.

PRIVACY

Sign in with Apple only — Roughly never sees a password, and Hide My Email works
normally. Your entries are yours, and Settings has a Delete account button that
erases all of it immediately. What is stored and who processes it is written out
in full at the privacy policy link below.

NOT MEDICAL ADVICE

Roughly is a coach, not a clinician. Its estimates are approximations and
nothing it says is medical advice, diagnosis or treatment. Talk to a doctor or a
registered dietitian before changing how you eat or train — particularly if you
have a health condition or any history of disordered eating.
```

## Keywords (100, comma-separated, no spaces)

```
meal,calories,protein,macros,diet,nutrition,food,log,tracker,weight,check-in,habit,training,journal
```

99 characters. Nothing here repeats the app name: Apple indexes "Roughly",
"Fitness" and "Coach" from the name itself, so `coach` and `fitness` were
removed once the name grew — that recovered 14 characters, spent on `training`
and `journal`.

"photo" is deliberately absent: the iOS app has no camera feature, and a keyword
the app cannot deliver on invites a 2.3.7 metadata rejection.

## Support URL

```
https://nutrition-coach-omega.vercel.app/support
```

## Marketing URL

```
https://nutrition-coach-omega.vercel.app
```

## Privacy policy URL

```
https://nutrition-coach-omega.vercel.app/privacy
```

Must match `AppState.privacyPolicyURL`, which is what the in-app Settings link
opens. A reviewer checks that the two agree.

## Category

Primary: **Health & Fitness**. Secondary: **Food & Drink**.

## Age rating

17+ is not required. Expect these answers:

- Unrestricted web access: **No** — the app has no in-app browser.
- Medical/treatment information: **No** — it gives no diagnosis or treatment,
  and the disclaimer says so in the app, the description and the policy.
- Simulated gambling, contests, horror, violence, sexual content: **No**.

## App Privacy answers

These must match `ios/NutritionCoach/PrivacyInfo.xcprivacy` and `/privacy` on
the web. All three disagreeing is a routine rejection.

| Data | Linked to user | Used for tracking | Purpose |
|---|---|---|---|
| Email address | Yes | No | App functionality |
| Name | Yes | No | App functionality |
| Health | Yes | No | App functionality |
| Fitness | Yes | No | App functionality |
| Other user content | Yes | No | App functionality |
| Device ID | Yes | No | App functionality |

Nothing is used for tracking, and no data is shared with a data broker.

**Photos or videos is deliberately not listed.** The service stores meal photos,
but they are collected by the web app; the iOS binary has no camera and no photo
picker. The privacy policy at `/privacy` covers the whole service and does
mention photos — that is one policy describing more than one client, which is
normal, and is not the mismatch Apple looks for. What must not happen is the
reverse: the app collecting something the labels omit.

## Screenshots

Generated by `Tools/screenshots.sh` into `ios/Screenshots/`, and committed. The
script drives the app from fixtures (`DemoTransport.swift`, DEBUG-only) rather
than a backend, so the set is reproducible and does not depend on an account
having the right data in it on the day — or on the timezone of the machine that
runs it, now that `weekOf` is a calendar date rather than an instant.

Required and captured: 6.9" (1320 × 2868) and 6.5" (1242 × 2688). iPad is **not**
required — `TARGETED_DEVICE_FAMILY` is `1`, so Apple asks for no iPad set.

Four, in this order, because the first two are all most people scroll:

1. **Coach** — a real exchange: a meal logged by talking, and the coach saying
   out loud that 140g of protein is an estimate because the package number is a
   legal tolerance. The product's whole argument, in the app's own voice.
2. **This week** — the check-in question, verbatim from `QUESTIONS.body`.
3. **Review** — two weeks of answers, each kept next to the words the user
   actually used.
4. **Settings** — notifications, the legal links, and the delete-account row.
   Also the fastest way for a reviewer to confirm 5.1.1(v) is satisfied.

The shots are of the four tabs the app actually has. There is deliberately no
meal-photo screenshot: photo logging exists on the web, **not** in the iOS app,
and a screenshot of a feature the binary does not contain is a 2.3.3 rejection.

Coach leads rather than the check-in, even though the check-in is the product's
core surface, because the check-in screen is mostly empty on load — one
question, one field, and roughly two-thirds blank space. Worth fixing in the
app; until then it is a weak first impression and a poor lead shot.
