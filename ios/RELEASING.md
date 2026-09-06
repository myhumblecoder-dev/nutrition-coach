# Releasing the iOS app

CI (`.github/workflows/ios.yml`) builds and tests every change under `ios/`, and runs
`appstore check --static` — the submission mechanics that are invisible until an upload
rejects them.

CD (`.github/workflows/ios-cd.yml`) archives, signs and uploads to TestFlight. It is
**manual** (`workflow_dispatch`): a build number can never be reused, so a routine push
should not spend one.

## Before the first run

### 1. App Store Connect app record
Needed for TestFlight — unlike web Sign in with Apple, which needs no record at all.
Create it at appstoreconnect.apple.com with bundle ID `dev.myhumblecoder.nutritioncoach`.

### 2. Distribution certificate
Apple Distribution is a *different* certificate from Apple Development; having one
implies nothing about the other. Create it in Xcode (Settings → Accounts → Manage
Certificates → + → Apple Distribution), then export from Keychain Access as `.p12` with
a password.

```
base64 -i Distribution.p12 | pbcopy    # → secret IOS_DIST_CERT_P12_BASE64
```

### 3. App Store Connect API key
Users and Access → Integrations → App Store Connect API → generate a key with the
**App Manager** role. The `.p8` downloads once.

```
base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy   # → secret APP_STORE_CONNECT_PRIVATE_KEY
```

### 4. Repository secrets
`Settings → Secrets and variables → Actions`:

| Secret | Value |
|---|---|
| `IOS_DIST_CERT_P12_BASE64` | base64 of the distribution `.p12` |
| `IOS_DIST_CERT_PASSWORD` | password used when exporting it |
| `APP_STORE_CONNECT_KEY_ID` | 10 characters, e.g. `ABC1234567` |
| `APP_STORE_CONNECT_ISSUER_ID` | UUID shown above the key list |
| `APP_STORE_CONNECT_PRIVATE_KEY` | base64 of the `.p8` |

CD fails immediately with a list if any are missing, rather than 20 minutes later inside
`xcodebuild` with a signing error that blames the wrong thing.

## Running it

Actions → **iOS CD** → Run workflow. Build numbers come from `github.run_number`, so
every run is unique — `project.yml`'s `CURRENT_PROJECT_VERSION: "1"` is only the local
default and works for exactly one upload.

The `.xcarchive` is kept as an artifact for 7 days on both success and failure, because a
signing problem is far easier to diagnose from the archive than from the log.

## Submission paperwork

`ios/STORE-LISTING.md` holds the App Store Connect copy — name, description, keywords,
the App Privacy answers and the screenshot plan. `ios/REVIEW-NOTES.md` holds the note to
the reviewer, a pre-submission checklist, and the rejection risks worth knowing before
they arrive rather than after. Both are in the repo so a change to what the app does and
a change to what the listing claims land in the same diff.

## Known gaps

- **Screenshots are not automated.** appstore-kit's `screenshots`,
  `archive` and `metadata` commands are on its roadmap but unshipped, so the five shots
  listed in `STORE-LISTING.md` are captured from the simulator by hand.
- **`appstore check`'s third-party sign-in check is disabled** in `appstore.config.json`.
  Its regex matches `Sign in with Apple` and `ASAuthorizationAppleID` — the things
  guideline 4.8 *requires* — so pointing it at `SignInView.swift` fails the build for
  being correct. Re-enable once the regex upstream tells a compliant implementation apart
  from a violation.
- **`appstore check` runs `--static` only.** The full check runs repo gates and network
  checks; there are no gates configured yet.
- **appstore-kit is not published to npm**, so both workflows clone and build it from
  source, pinned to a commit in `APPSTORE_KIT_REF`. Publishing it would remove ~40s per
  run and let this be a normal devDependency.
