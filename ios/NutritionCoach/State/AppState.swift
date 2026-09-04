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

    let client: APIClient
    private(set) var isSignedIn: Bool
    var signInError: String?

    init(client: APIClient? = nil) {
        let resolved = client ?? APIClient(
            baseURL: AppState.productionURL,
            tokenStore: KeychainTokenStore(),
            attest: AppAttestService()
        )
        self.client = resolved
        self.isSignedIn = resolved.isSignedIn
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

    func signOut() async {
        await client.signOut()
        isSignedIn = false
    }

    /// Called when any screen sees a 401: the session was revoked server-side,
    /// so the UI must fall back to sign-in rather than retrying forever.
    func handleUnauthorized() {
        isSignedIn = false
    }
}
