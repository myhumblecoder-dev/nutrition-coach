# Submitting Roughly to the App Store

The order matters. `RELEASING.md` covers the build mechanics, `STORE-LISTING.md`
and `REVIEW-NOTES.md` hold the copy; this is the sequence that gets a build in
front of a reviewer without doing steps that later have to be undone.

Each step says how to tell it worked, because most of these fail quietly.

---

## 1. Release to production

Merge the `develop` → `main` PR. CD deploys on push to `main` and runs
`prisma db push --accept-data-loss` as part of it.

Before merging, confirm the schema diff is additive — no removed lines:

```bash
git diff origin/main..origin/develop -- prisma/schema.prisma | grep -E "^-" | grep -v "^---"
```

Empty output means nothing can be dropped. Non-empty means read every line
before proceeding.

**Verify:** the deploy job is green in Actions.

## 2. Set the production environment

In Vercel → Project → Settings → Environment Variables → Production:

| Variable | Value |
|---|---|
| `APPLE_TEAM_ID` | `S84D3BXRYL` |

Read separately from `APNS_TEAM_ID` because push and attestation are
independently optional. Leave `APP_ATTEST_REQUIRED` unset — turning enforcement
on before a client that sends assertions has shipped locks out every user.

**Env changes do not reach a running deployment.** Redeploy after saving.

**Verify:** `curl -s -o /dev/null -w '%{http_code}' -X POST \
https://nutrition-coach-omega.vercel.app/api/v1/attest/challenge` → `200`,
not `500`.

## 3. Confirm the reviewer's links resolve

Both URLs are already in App Store Connect and a reviewer clicks them.

```bash
for p in privacy support; do
  printf "%-8s %s\n" "$p" \
    "$(curl -s -o /dev/null -w '%{http_code}' https://nutrition-coach-omega.vercel.app/$p)"
done
```

Both must be `200`. They must also load **signed out** — a redirect to sign-in
reads as a broken link.

## 4. Publish a real support address

`src/lib/contact.ts` carries the address printed on `/privacy` and `/support`.
Apple requires a working support contact, and the placeholder in there is not
one. Change it, redeploy, and re-check step 3.

## 5. App Store Connect API key

Users and Access → Integrations → App Store Connect API → **Team Keys** →
generate with the **App Manager** role.

Record the **Key ID** (10 characters) and the **Issuer ID** (the UUID above the
key list). The `.p8` downloads exactly once; losing it means revoking the key
and starting over.

## 6. Export the distribution certificate

It already exists — `appstore doctor` reports
`Apple Distribution: Thomas Gooch (S84D3BXRYL)`. Keychain Access → My
Certificates → right-click it → Export → `.p12`, with a password.

If `doctor` says it is absent, create it in Xcode → Settings → Accounts →
Manage Certificates → + → Apple Distribution. "Apple Development" is a
different certificate and having one implies nothing about the other.

## 7. Set the five repository secrets

Piped from files so the values never appear in shell history:

```bash
base64 -i ~/Desktop/Distribution.p12 | gh secret set IOS_DIST_CERT_P12_BASE64
gh secret set IOS_DIST_CERT_PASSWORD          # type it, then Ctrl-D
gh secret set APP_STORE_CONNECT_KEY_ID        # the 10-character Key ID
gh secret set APP_STORE_CONNECT_ISSUER_ID     # the Issuer ID UUID
base64 -i ~/Downloads/AuthKey_XXXXXXXXXX.p8 | gh secret set APP_STORE_CONNECT_PRIVATE_KEY
```

**Verify:** `gh secret list` shows all five.

## 7b. Check the version matches App Store Connect

`MARKETING_VERSION` in `ios/project.yml` must equal the version created in App
Store Connect:

```bash
grep MARKETING_VERSION ios/project.yml
```

Builds are matched to a version by `CFBundleShortVersionString`. Upload `0.1.0`
against a `1.0` submission and the build simply does not appear in the picker —
no error, no explanation, and the build number is already spent.

`CURRENT_PROJECT_VERSION` needs no attention: CD passes `github.run_number`.

## 8. Build to TestFlight

Actions → **iOS CD** → Run workflow, against `main`.

It checks all five secrets first and fails with a list if any are missing,
rather than dying inside `xcodebuild` twenty minutes later with a signing error
that blames the wrong thing. Build numbers come from `github.run_number`, so
they cannot collide. The `.xcarchive` is kept for 7 days on success and failure
alike — a signing problem is far easier to read from the archive than the log.

## 9. Verify on a real device

Three things fail only on hardware, and all three are rejections:

- **Sign in with Apple from the Release build.** The native flow verifies the
  identity token's audience against the Bundle ID, so a mismatch with
  `AUTH_APPLE_BUNDLE_ID` on the server appears only here.
- **Push arrives.** Release sets `aps-environment` to `production`; a token
  registered by a Debug build will not work against it.
- **Settings → Delete account, against production.** The first thing a reviewer
  checks for 5.1.1(v).

Also worth looking at: Today should fill in after you send the coach a message.
A brand-new account is empty by design.

## 10. Fill in App Store Connect

Text fields come from `ios/listing/`, one file per field, paste verbatim:

| Field | File |
|---|---|
| Name | `name.md` |
| Subtitle | `subtitle.md` |
| Promotional Text | `promotional-text.md` |
| Description | `description.md` |
| Keywords | `keywords.md` |
| Support URL | `support-url.md` |
| Marketing URL | `marketing-url.md` |
| Privacy Policy URL | `privacy-policy-url.md` |
| App Review → Notes | `review-notes.md` |

Screenshots: everything in `ios/Screenshots/6.5-inch/`, in filename order. Only
the first three appear on install sheets, and `2-receipts` is the shot that
explains the product, so the order is not cosmetic.

Then, in the sidebar:

- **App Information** — category Health & Fitness, secondary Food & Drink
- **Age Rating** — the table in `STORE-LISTING.md`. Every answer is None/No
  except **Health or Wellness Topics: Yes**
- **App Privacy** — the six data types in `STORE-LISTING.md`, all Linked, none
  Tracking, purpose App Functionality. **Not** Photos or Videos. Then Publish
- **Pricing and Availability** — Free
- **App Review Information** — uncheck "Sign-in required"; there is no username
  or password, and the Notes explain the reviewer should use their own Apple ID
- **App Store Version Release** — Manually release, so approval and going live
  stay separate decisions

## 11. Submit

Select the build, then Add for Review.

## Regenerating anything

```bash
node scripts/generate-listing-files.mjs   # ios/listing/ from STORE-LISTING.md
node scripts/check-listing-lengths.mjs    # field limits and placeholders
ios/Tools/screenshots.sh                  # both required sizes, verified
node ../appstore-kit/dist/cli.js check    # the full submission gate
node ../appstore-kit/dist/cli.js doctor   # can this machine build and sign
```
