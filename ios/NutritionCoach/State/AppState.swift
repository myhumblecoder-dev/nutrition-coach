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

    let client: APIClient
    private(set) var isSignedIn: Bool
    var signInError: String?

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
        self.isSignedIn = resolved.isSignedIn
    }

    private static func liveClient() -> APIClient {
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
        isSignedIn = false
    }

    /// Permanently deletes the account. Returns an error message on failure so
    /// the caller can show it, rather than silently dropping the user back to
    /// sign-in as though the delete had worked.
    func deleteAccount() async -> String? {
        do {
            try await client.deleteAccount()
            MealReminders.cancel()
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
