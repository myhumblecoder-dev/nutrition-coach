import Foundation
import Observation

/// App-wide session and configuration.
///
/// The base URL is compiled in rather than user-editable: this client talks to
/// exactly one backend, and a settable host would be an obvious way to
/// exfiltrate a bearer token.
@MainActor
@Observable
final class AppState {
    static let productionURL = URL(string: "https://nutrition-coach-omega.vercel.app")!

    /// The same URLs given to App Store Connect. Both are required listing
    /// fields, and a reviewer checks that the in-app links match them.
    static let privacyPolicyURL = productionURL.appendingPathComponent("privacy")
    static let supportURL = productionURL.appendingPathComponent("support")
    /// The EULA. Required on the paywall by Guideline 3.1.2 and in the App
    /// Store Connect listing; a reviewer taps it in both places.
    static let termsURL = productionURL.appendingPathComponent("terms")

    let client: APIClient
    let store: Store
    private(set) var isSignedIn: Bool
    var signInError: String?

    /// What the server says this account is entitled to. Nil until asked —
    /// which is not the same as lapsed, and must not raise a paywall.
    private(set) var entitlement: Entitlement?

    /// Read by the gated screens. Unknown counts as entitled: enforcement is
    /// the server's job, and guessing "no" here would lock out a paying user
    /// whose entitlement call merely timed out.
    var isEntitled: Bool { entitlement?.isEntitled ?? true }

    init(client: APIClient? = nil) {
        #if DEBUG
        // Screenshot fixtures, behind a launch argument and a compile-time
        // fence. See DemoTransport.swift.
        let fallback = DemoMode.isActive ? DemoMode.makeClient() : AppState.liveClient()
        #else
        let fallback = AppState.liveClient()
        #endif
        let resolved = client ?? fallback
        self.client = resolved
        self.store = Store(client: resolved)
        self.isSignedIn = resolved.isSignedIn
    }

    /// Starts the transaction listener. Called once at launch, before
    /// anything else: StoreKit replays transactions it finished while the app
    /// was closed — a renewal, a purchase made on another device — and they
    /// are delivered only to a listener that is already running.
    func startObservingTransactions() {
        store.listenForUpdates()
    }

    /// Asks the server what this account is entitled to.
    ///
    /// Failures leave the previous answer in place rather than clearing it. A
    /// dropped connection is not a cancelled subscription, and treating it as
    /// one would put a paywall in front of someone who is paying.
    func refreshEntitlement() async {
        guard let fresh = try? await client.subscription() else { return }
        entitlement = fresh
    }

    /// Internal and non-isolated so a background App Intent can build one.
    /// `APIClient` has no MainActor or `AppState` coupling of its own — only
    /// this factory did, by living on a MainActor type.
    nonisolated static func liveClient() -> APIClient {
        APIClient(
            baseURL: AppState.productionURL,
            tokenStore: KeychainTokenStore(),
            attest: AppAttestService()
        )
    }

    /// Registers the device's App Attest key. A no-op after the first
    /// successful run, and before sign-in on purpose: attestation gates the
    /// sign-in call itself, so it has to happen first.
    func prepareAttestation() async {
        await client.prepareAttestation()
    }

    func signIn(identityToken: String) async {
        signInError = nil
        do {
            _ = try await client.signInWithApple(identityToken: identityToken)
            isSignedIn = true
            // Registration is deferred until after sign-in: a device token
            // means nothing without an account to attach it to.
            await PushRegistrar.shared.registerIfAuthorized(with: client)
        } catch {
            signInError = "Sign-in failed. Please try again."
        }
    }

    /// Puts the three daily nudges on the device, at the times the user's own
    /// day runs to. Local rather than pushed, so they cannot arrive at the
    /// wrong hour and cost nothing to send.
    func scheduleMealReminders() async {
        guard let zone = try? await client.timezone() else { return }
        await MealReminders.schedule(timeZoneIdentifier: zone)
    }

    func signOut() async {
        // Before the token goes: these belong to the account that is leaving,
        // and a signed-out phone still buzzing about breakfast is a bug the
        // user cannot turn off from inside the app.
        MealReminders.cancel()
        await client.signOut()
        entitlement = nil
        isSignedIn = false
    }

    /// Permanently deletes the account. Returns an error message on failure so
    /// the caller can show it, rather than silently dropping the user back to
    /// sign-in as though the delete had worked.
    func deleteAccount() async -> String? {
        do {
            try await client.deleteAccount()
            MealReminders.cancel()
            entitlement = nil
            isSignedIn = false
            return nil
        } catch {
            return "Couldn't delete your account. Please try again."
        }
    }

    /// Called when any screen sees a 401: the session was revoked server-side,
    /// so the UI must fall back to sign-in rather than retrying forever.
    func handleUnauthorized() {
        isSignedIn = false
    }
}
