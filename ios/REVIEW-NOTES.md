# App Review notes — Roughly

> **Do not paste this file into App Store Connect.** Only the fenced block under
> "Notes for the reviewer" goes to Apple, and `ios/listing/review-notes.md` holds
> exactly that, already extracted. Everything after it — the checklist and the
> rejection risks — is internal. Sending it would hand a reviewer an unticked
> list of things you have not verified and a written argument for why the app
> might warrant rejection.
>
> The whole file is 4,858 characters; the field caps at 4,000, so pasting it
> fails on length before it can do that damage. That is luck, not a safeguard.

## Notes for the reviewer

```
Roughly is a personal diet and training coach. You tell it what you ate and how
you trained in plain language, it works out the rest, and once a week it asks
how the week actually went.

The App Store listing is "Roughly Fitness Coach"; the app itself is "Roughly" on
the home screen and throughout the interface. The shorter name is the product
name and avoids truncating under the icon.

SIGNING IN

Sign in with Apple is the only sign-in method, so no demo account is needed —
please use your own Apple ID. Hide My Email works normally; the app only ever
receives the relay address. A brand-new account starts empty, which is the
intended first-run experience.

WHERE TO LOOK

• "Today" is the first tab: calorie and protein rings, training bars, a weight
  trend, and — below them — "From your conversation", which shows the words the
  user typed next to what the coach logged from them. Nothing on this screen is
  an input.
• "Chat" is the coach. Logging happens by talking: "chicken burrito bowl, no
  rice, and I lifted this morning" is a complete entry. There is no logging
  form and no camera feature in this app.
• Settings holds notifications, the privacy policy and support links, and
  "Delete account".

The weekly check-in also happens in Chat. Once a week the coach asks four short
questions — how the body feels, strength, sleep, mood — one at a time, and the
user answers in their own words like any other message. There is no check-in
screen and no form; it is a conversation.

FIRST RUN

A new account opens with the coach already asking a question in Chat: what the
user is aiming for daily, in calories and protein, or — if they do not know —
their rough height and weight, from which a starting target is estimated. Answer
it in Chat and the rings on Today have something to measure against.

Today is deliberately empty before that, and says so rather than showing blank
graphs. Send the coach a message describing a meal and it appears on Today with
the sentence that produced it.

ACCOUNT DELETION (Guideline 5.1.1(v))

Settings → Delete account. It asks once to confirm and then permanently erases
the account and everything attached to it — meals, chat history, check-ins,
measurements, notification tokens, and any meal photos logged through the web
app. It is immediate and is not a support request or an email flow.

HEALTH CLAIMS (Guideline 1.4.1)

Roughly makes no medical claims. It does not diagnose, treat or offer medical
advice, and it says so in the app, in the App Store description and in the
privacy policy. Its calorie and protein figures are explicitly presented as
estimates from what you tell it, never as measurements — the app is named for
that.

PUSH NOTIFICATIONS

Used for one thing: telling the user the coach has asked this week's check-in
question, which is waiting for them in Chat. Permission is requested only when
the user taps "Turn on notifications" in Settings, never at launch.

REPORTING A COACH REPLY (Guideline 1.2)

Long-press any coach message in Chat and choose Report. It sends that reply to
us and confirms. The coach is generated and occasionally gets things wrong;
this is how a user says so.

THIRD-PARTY PROCESSING

Coach messages and check-in answers are processed by Anthropic's API to produce
the estimates and replies. Nothing is used for advertising, there is no analytics
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
- [ ] Screenshots regenerated with `Tools/screenshots.sh` if any of the four
      captured screens changed. Stale shots are a 2.3.3 problem.
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

**Anthropic-generated coach text is user-facing model output.** Mitigated
rather than argued: long-pressing any coach reply in Chat offers "Report",
which files the exact text the user saw for a human to read. Nothing is
published to other users, so this is not feed moderation — it is a record of
the model saying something it should not have.
