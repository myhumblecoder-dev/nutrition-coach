import CryptoKit
import DeviceCheck
import Foundation

/// App Attest: proof that a request came from a genuine, unmodified build of
/// this app on real Apple hardware.
///
/// The bearer token in `TokenStore` only proves someone signed in once. It
/// says nothing about what is making the request now, so a token lifted off a
/// device can be replayed from a script forever. An assertion is generated per
/// request over the exact bytes being sent, which is what closes that.
///
/// A protocol so tests can drive the flow without DeviceCheck, which is
/// unavailable in a unit-test bundle and on the Simulator.
protocol AttestProviding: AnyObject {
    /// False on the Simulator and on devices without a Secure Enclave. The app
    /// must stay usable in that case — see `APIClient.prepareAttestation`.
    var isSupported: Bool { get }

    /// The key identifier, present only once a key has been generated *and*
    /// the server has accepted its attestation.
    var keyId: String? { get }

    func generateKey() async throws -> String
    func attest(keyId: String, challenge: String) async throws -> String
    func persist(keyId: String)
    func assertion(keyId: String, over clientData: Data) async throws -> String
}

final class AppAttestService: AttestProviding {
    private let service = DCAppAttestService.shared
    private let store: TokenStoring

    /// The key identifier is stored, not the key: the private key never leaves
    /// the Secure Enclave. Losing the identifier only costs a fresh
    /// attestation on next launch.
    init(store: TokenStoring = KeychainTokenStore(account: "app-attest-key-id")) {
        self.store = store
    }

    var isSupported: Bool { service.isSupported }

    var keyId: String? { store.read() }

    func generateKey() async throws -> String {
        try await service.generateKey()
    }

    /// Attests a freshly generated key against a server challenge.
    ///
    /// Apple allows this exactly once per key, which is why the identifier is
    /// only persisted after the server accepts the result: a half-finished
    /// registration must leave no key behind that can never be attested again.
    func attest(keyId: String, challenge: String) async throws -> String {
        let hash = Data(SHA256.hash(data: Data(challenge.utf8)))
        let attestation = try await service.attestKey(keyId, clientDataHash: hash)
        return attestation.base64EncodedString()
    }

    func persist(keyId: String) {
        store.write(keyId)
    }

    /// Signs the exact bytes the server will hash.
    ///
    /// The server recomputes SHA256 over the request body (or, for a GET, the
    /// path), so binding the assertion to `clientData` here is what stops one
    /// being lifted from one call and replayed onto another.
    func assertion(keyId: String, over clientData: Data) async throws -> String {
        let hash = Data(SHA256.hash(data: clientData))
        let assertion = try await service.generateAssertion(keyId, clientDataHash: hash)
        return assertion.base64EncodedString()
    }
}
