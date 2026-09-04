# App Review notes — Roughly

Pasted into the **Notes** field of the App Review Information section. The
headings below are for reading here; the field takes plain prose.

## Notes for the reviewer

```
Roughly is a personal diet and training coach. You photograph a meal, it
estimates what is in it, and a coach that remembers your history talks to you
about it.

SIGNING IN

Sign in with Apple is the only sign-in method, so no demo account is needed —
please use your own Apple ID. Hide My Email works normally; the app only ever
receives the relay address. A brand-new account starts empty, which is the
intended first-run experience.

If you would prefer an account with history already in it rather than an empty
one, email <SUPPORT EMAIL> and we will provision one within a few hours.

WHERE TO LOOK

• "This week" is the first tab and the core of the product: the coach asks how
  the week went and responds to what you actually say.
• "Coach" is free-form chat.
• Photo logging is on the meal entry screen and needs the camera. On the
  simulator there is no camera; on device, the photo is sent to our backend and
  analysed by a vision model.
• Settings holds notifications, the privacy policy and support links, and
  "Delete account".

ACCOUNT DELETION (Guideline 5.1.1(v))

Settings → Delete account. It asks once to confirm and then permanently erases
the account and everything attached to it — meals, photos, chat history,
check-ins, measurements and notification tokens. It is immediate and is not a
support request or an email flow.

HEALTH CLAIMS (Guideline 1.4.1)

Roughly makes no medical claims. It does not diagnose, treat or offer medical
advice, and it says so in the app, in the App Store description and in the
privacy policy. Its calorie and protein figures are explicitly presented as
estimates from a photograph — the app is named for that.

PUSH NOTIFICATIONS

Used for one thing: reminding the user that their weekly check-in is due.
Permission is requested only when the user taps "Turn on notifications" in
Settings, never at launch.

THIRD-PARTY PROCESSING

Meal photos and coach messages are processed by Anthropic's API to produce the
estimates and replies. Nothing is used for advertising, there is no analytics
SDK, and no data is shared with data brokers. The full list is at
https://nutrition-coach-omega.vercel.app/privacy

IPHONE ONLY

TARGETED_DEVICE_FAMILY is 1. The app is not iPad-capable and no iPad layout is
claimed.
```

## Before submitting, confirm

- [ ] `<SUPPORT EMAIL>` above is replaced with the real address, and matches
      `SUPPORT_EMAIL` in `src/lib/contact.ts` and the listing's Support URL page.
- [ ] `/privacy` and `/support` are deployed and load **signed out** — a
      reviewer opens them in a clean browser, and a redirect to sign-in reads as
      a broken link.
- [ ] The App Privacy answers in App Store Connect match
      `NutritionCoach/PrivacyInfo.xcprivacy` and `/privacy`. All three must agree.
- [ ] `node ../appstore-kit/dist/cli.js check` (without `--static`) passes.
- [ ] Settings → Delete account works against the production backend, not just
      a local one. It is the first thing a reviewer checks for 5.1.1(v).
- [ ] Sign in with Apple works from a **Release** build. The native flow verifies
      the identity token's audience against the Bundle ID, so a mismatch between
      `PRODUCT_BUNDLE_IDENTIFIER` and `AUTH_APPLE_BUNDLE_ID` on the server fails
      only here, never in Debug against a local server.
- [ ] Push arrives on a TestFlight build. Release now sets `aps-environment` to
      `production`; a token registered by a Debug build will not work against it.

## Rejection risks we know about

**The app is a thin client.** Everything — vision, chat, check-ins — happens on
our backend. Guideline 4.2 (minimum functionality) is the one to watch. The
argument, if it is raised: the app is the interface to a service that does
substantial work, is not a repackaged website, and has no web equivalent that
the iOS app merely wraps.

**Estimates could read as health claims.** 1.4.1 is why the disclaimer appears
in three places rather than one.

**Anthropic-generated coach text is user-facing model output.** 1.2 expects
apps with user-generated or model-generated content to have a way to report
something objectionable. There is currently no in-app report control — the
coach only ever addresses the person who wrote to it, and there is no other
user to be harmed. If this is challenged, the fix is a "Report this reply"
action in the chat view.
