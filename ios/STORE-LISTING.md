# App Store listing — Roughly

The copy that goes into App Store Connect. Kept in the repo so a change to what
the app does and a change to what the listing claims land in the same diff.

Field lengths are Apple's hard limits; the counts below are the current text.

## Name (30)

```
Roughly
```

## Subtitle (30)

```
Estimate meals, not calories
```

`Roughly: Estimate Meals` was the alternative. Rejected — a subtitle that
repeats the name spends half the budget saying nothing.

## Promotional text (170)

Editable without a new build, so this is where a change of emphasis goes.

```
Photograph what you ate. Get an honest estimate and a coach who remembers what
you said last week. No barcodes, no gram-by-gram data entry, no pretending the
numbers are exact.
```

## Description (4000)

```
Roughly is a diet and training coach that starts from an uncomfortable fact:
nobody knows exactly how many calories are on their plate. The label is a legal
tolerance, not a measurement. The database entry is somebody else's recipe. The
gram-by-gram log you kept for three days was a guess with more decimal places.

So Roughly does not ask you to count. Take a photo of your meal and it estimates
what is in it — food by food, calories and protein — and says so plainly. You
correct it in plain language when it is wrong, because you were there and it
was not.

WHAT IT DOES

• Photo-first logging. One photo, one estimate. No barcodes to scan, no serving
  sizes to look up, no fourteen-field entry form.

• A coach that remembers. Talk to it the way you would talk to a person. It has
  your history — what you ate, how you trained, what you weighed, how you slept
  — and it answers in that context rather than reciting generic advice.

• Weekly check-ins. Once a week it asks how the week actually went, and adjusts
  what it suggests based on your answer instead of a formula.

• Training, sleep, mood and measurements. Log them if they are useful to you.
  They change what the coach says. Skip them and nothing breaks.

• Honest numbers. Estimates are presented as estimates. When the coach is
  unsure, it says so.

WHAT IT DOES NOT DO

No streaks. No badges. No shaming you for a Tuesday. No advertising, no
analytics SDK, no selling your data to anybody.

PRIVACY

Sign in with Apple only — Roughly never sees a password, and Hide My Email works
normally. Your photos and entries are yours, and Settings has a Delete account
button that erases all of it immediately. What is stored and who processes it is
written out in full at the privacy policy link below.

NOT MEDICAL ADVICE

Roughly is a coach, not a clinician. Its estimates are approximations and
nothing it says is medical advice, diagnosis or treatment. Talk to a doctor or a
registered dietitian before changing how you eat or train — particularly if you
have a health condition or any history of disordered eating.
```

## Keywords (100, comma-separated, no spaces)

```
meal,photo,calories,protein,macros,diet,coach,nutrition,food,log,tracker,weight,fitness,check-in
```

97 characters. "Roughly" is deliberately absent: the app name is already indexed
and repeating it in keywords wastes the budget.

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
| Photos or videos | Yes | No | App functionality |
| Other user content | Yes | No | App functionality |
| Device ID | Yes | No | App functionality |

Nothing is used for tracking, and no data is shared with a data broker.

## Screenshots

Required: 6.9" (1320 × 2868) and 6.5" (1242 × 2688). iPad is **not** required —
`TARGETED_DEVICE_FAMILY` is `1`, so the app is iPhone-only and Apple asks for no
iPad set.

Five, in this order, because the first two are all most people scroll:

1. **This week** — the check-in question, mid-conversation. The product's
   argument in one screen.
2. **A meal estimate** — a photo with its food-by-food breakdown, showing that
   the numbers are approximate on purpose.
3. **Coach chat** — a real exchange where the coach uses last week's context.
4. **Review** — the week's entries at a glance.
5. **Settings** — notifications and the delete-account row. Also the fastest way
   for a reviewer to confirm 5.1.1(v) is satisfied.

Not yet automated: appstore-kit's `screenshots` command is unshipped, so the
first submission captures these by hand from the simulator.
