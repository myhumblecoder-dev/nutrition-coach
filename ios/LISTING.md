# App Store listing copy

Paste-ready. Each field's limit is in the heading; `scripts/check-listing.mjs`
counts them so a change here cannot quietly overflow a field and get
truncated mid-sentence in the store.

Positioning comes from `src/lib/voice.ts`, which states it plainly: the
category shames people out of using it, so the sarcasm points at calorie math
and diet culture and never at the person. The listing has to sound like the
coach without doing the bit — a store page saying "Honey" reads as a gimmick
before anyone has met the product.

## Subtitle (30)

```
Calories, roughly. No shame.
```

## Promotional text (170)

Updatable without a new version, so this is the field to change for a
seasonal push or a new feature. Not indexed for search.

```
One week free. Photograph your plate for calories and protein, log the rest by talking, and skip the barcode scanning, the twelve-field forms and the guilt.
```

## Keywords (100)

No spaces after commas — they count. The app name and subtitle are already
indexed, so nothing here repeats them. Singulars only: Apple matches plurals.

```
calorie,macro,protein,food diary,meal photo,nutrition,tracker,coach,weight,diet,log,ai
```

## Description (4000)

```
Most food apps make you feel bad before you have finished breakfast.

Roughly does not. Photograph your plate and it tells you roughly what is on it — calories, protein, and the food it thinks it is looking at. No barcode scanning. No hunting a database for "chicken breast, grilled, no skin". No twelve-field form for a sandwich.

Or just say it. "Chobani and a banana." Logged. "Squats 3x8 at 185." Logged. It is a conversation, not data entry.


THE NAME IS THE PROMISE

It estimates, and it says so. A calorie count on a label is a legal tolerance, not a fact, and a photograph is a good guess rather than a lab result. Roughly is the honest version of a number every other app hands you as gospel — and roughly right every day beats precisely right twice.

Got it wrong? Tell it. "That was double the rice." It looks at the photo again and updates.


A COACH, NOT A SPREADSHEET

Roughly's coach is brief, dry, and has heard every excuse. It does not gush. It does not lecture. It does not ask "and what else?" after every sentence — tell it what you ate and it says "Logged." and gets out of your way.

It is also on your side. The sarcasm is aimed at calorie math and diet culture, never at you, your body, or what you had for lunch. No guilt, no streak to break, no confetti for eating a salad.

Ask it something and you get an answer. Sets, reps, portions, rest days, what to do with the equipment you actually own.


WHAT YOU GET

• Photograph a meal — calories and protein back in seconds
• Log by talking: food, training, sleep, weight, caffeine, mood
• Daily calorie and protein targets, with rings showing where you stand
• Training you can read back — "squats 3x8 at 185", not "resistance, 45 min"
• A weekly check-in that asks how it actually went
• Three daily nudges, at your hours, in your timezone
• Your whole history, a day at a time


NOT MEDICAL ADVICE

Roughly is a coach, not a clinician, and its numbers are estimates. Nothing it says is medical advice, diagnosis or treatment. Talk to a doctor or a registered dietitian before changing how you eat or train — especially if you have a health condition or any history of disordered eating.


PRIVACY

No analytics SDK. No advertising identifier. No tracking across other apps or websites. Nothing sold or shared with data brokers. Your meals and conversations are processed to give you estimates and replies, and for nothing else. You can delete your account, and everything in it, from inside the app.


SUBSCRIPTION

One week free, then a monthly or annual subscription. Your logged history stays yours either way — a lapsed account can still read everything it recorded.
```

## What still has to match

- **Terms of Use (EULA)** — `https://nutrition-coach-omega.vercel.app/terms`, the
  same URL the paywall links to. Guideline 3.1.2 wants it in both places.
- **Privacy policy** — `https://nutrition-coach-omega.vercel.app/privacy`
- **Support** — `https://nutrition-coach-omega.vercel.app/support`
- **App Privacy** answers must agree with `PrivacyInfo.xcprivacy`, including
  the Purchase History entry. The PRIVACY paragraph above claims no tracking
  and no data brokers; the manifest has to say the same, or the listing is a
  claim App Review can check and find false.
