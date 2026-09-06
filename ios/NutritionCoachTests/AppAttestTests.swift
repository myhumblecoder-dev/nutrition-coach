import XCTest
@testable import NutritionCoach

/// Stands in for DeviceCheck, which is unavailable in a test bundle and on the
/// Simulator. Records what it was asked to sign so the tests can assert the
/// exact bytes — that binding is the whole point of an assertion.
final class StubAttestService: AttestProviding {
    var isSupported = true
    var keyId: String?

    var generateKeyResult = "generated-key"
    var attestResult = "attestation-blob"
    var assertionResult = "assertion-blob"
    var generateKeyError: Error?
    var assertionError: Error?

    private(set) var signedData: [Data] = []
    private(set) var attestedChallenge: String?
    private(set) var persisted: String?

    func generateKey() async throws -> String {
        if let generateKeyError { throw generateKeyError }
        return generateKeyResult
    }

    func attest(keyId: String, challenge: String) async throws -> String {
        attestedChallenge = challenge
        return attestResult
    }

    func persist(keyId: String) {
        persisted = keyId
        self.keyId = keyId
    }

    func assertion(keyId: String, over clientData: Data) async throws -> String {
        if let assertionError { throw assertionError }
        signedData.append(clientData)
        return assertionResult
    }
}

private enum StubError: Error { case boom }

final class AppAttestTests: XCTestCase {
    private var store: InMemoryTokenStore!
    private var attest: StubAttestService!
    private var client: APIClient!

    override func setUp() {
        super.setUp()
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        store = InMemoryTokenStore(token: "session-abc")
        attest = StubAttestService()
        client = APIClient(
            baseURL: URL(string: "https://nutrition-coach-omega.vercel.app")!,
            session: URLSession(configuration: config),
            tokenStore: store,
            attest: attest
        )
    }

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.lastRequest = nil
        StubURLProtocol.recorded = []
        super.tearDown()
    }

    private func respond(_ status: Int, _ json: String) {
        StubURLProtocol.handler = { _ in (status, Data(json.utf8)) }
    }

    /// Answers the two calls registration makes, keyed by path.
    private func respondToRegistration(challenge: String = "nonce.123.mac", registerStatus: Int = 200) {
        StubURLProtocol.handler = { request in
            if request.url?.path.hasSuffix("/attest/challenge") == true {
                return (200, Data(#"{"challenge":"\#(challenge)"}"#.utf8))
            }
            return (registerStatus, Data("{}".utf8))
        }
    }

    // MARK: - Signing requests

    func testAPostIsSignedOverTheExactBodyBytes() async throws {
        // The server hashes the request body it receives. Signing anything
        // else — a re-serialised dictionary, a different key order — produces
        // an assertion that cannot verify.
        attest.keyId = "key-1"
        respond(200, #"{"assistantReply":"Sounds good."}"#)

        _ = try await client.sendMessage("had eggs")

        XCTAssertEqual(attest.signedData.count, 1)
        XCTAssertEqual(
            attest.signedData.first,
            try JSONSerialization.data(withJSONObject: ["message": "had eggs"])
        )
        XCTAssertEqual(StubURLProtocol.lastRequest?.value(forHTTPHeaderField: "x-attest-key-id"), "key-1")
        XCTAssertEqual(
            StubURLProtocol.lastRequest?.value(forHTTPHeaderField: "x-attest-assertion"),
            "assertion-blob"
        )
    }

    func testAGetIsSignedOverThePathBecauseThereIsNoBody() async throws {
        // Matches the server's fallback: `body || new URL(request.url).pathname`.
        attest.keyId = "key-1"
        respond(200, #"{"meals":[],"target":null,"consumed":{"calories":0,"protein":0}}"#)

        _ = try await client.today()

        XCTAssertEqual(attest.signedData.first, Data("/api/v1/today".utf8))
    }

    func testSignInIsAttestedEvenThoughItCarriesNoBearer() async throws {
        // Sign-in is the account-creation path, so it is exactly where farmed
        // accounts would come from. Being unauthenticated must not exempt it.
        attest.keyId = "key-1"
        store.clear()
        respond(200, """
        {"token":"t","expires":"2027-01-01T00:00:00.000Z",
         "user":{"id":"u1","email":"a@b.c","name":null}}
        """)

        _ = try await client.signInWithApple(identityToken: "apple-jwt")

        XCTAssertEqual(StubURLProtocol.lastRequest?.value(forHTTPHeaderField: "x-attest-key-id"), "key-1")
        XCTAssertNil(StubURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"))
    }

    func testRequestsAreUnsignedBeforeAKeyIsRegistered() async throws {
        attest.keyId = nil
        respond(200, #"{"messages":[]}"#)

        _ = try await client.chatHistory()

        XCTAssertTrue(attest.signedData.isEmpty)
        XCTAssertNil(StubURLProtocol.lastRequest?.value(forHTTPHeaderField: "x-attest-key-id"))
    }

    func testAnUnsupportedDeviceStillTalksToTheAPI() async throws {
        // The Simulator and pre-Secure-Enclave devices cannot attest. While
        // enforcement is off server-side they must keep working.
        attest.isSupported = false
        attest.keyId = "key-1"
        respond(200, #"{"messages":[]}"#)

        _ = try await client.chatHistory()

        XCTAssertNil(StubURLProtocol.lastRequest?.value(forHTTPHeaderField: "x-attest-key-id"))
    }

    func testAFailedAssertionSendsTheRequestUnsignedRatherThanFailingLocally() async throws {
        // Refusing here would only move the server's 401 earlier while adding
        // a second place that decides whether attestation is mandatory.
        attest.keyId = "key-1"
        attest.assertionError = StubError.boom
        respond(200, #"{"messages":[]}"#)

        _ = try await client.chatHistory()

        XCTAssertNil(StubURLProtocol.lastRequest?.value(forHTTPHeaderField: "x-attest-assertion"))
    }

    // MARK: - Registration

    func testRegistrationAttestsTheServerChallengeAndPersistsTheKey() async {
        respondToRegistration(challenge: "nonce.123.mac")

        await client.prepareAttestation()

        XCTAssertEqual(attest.attestedChallenge, "nonce.123.mac")
        XCTAssertEqual(attest.persisted, "generated-key")
        XCTAssertEqual(StubURLProtocol.recorded.count, 2)
    }

    func testRegistrationCallsAreNotThemselvesSigned() async {
        // /attest and /attest/challenge cannot require an assertion: they are
        // how a device gets a key in the first place.
        respondToRegistration()

        await client.prepareAttestation()

        XCTAssertTrue(attest.signedData.isEmpty)
        for request in StubURLProtocol.recorded {
            XCTAssertNil(request.value(forHTTPHeaderField: "x-attest-key-id"))
        }
    }

    func testARejectedRegistrationDoesNotPersistTheKey() async {
        // Apple allows attestKey once per key. Persisting an identifier the
        // server rejected would strand the device on a key it can never
        // re-attest; leaving it unset retries with a fresh one next launch.
        respondToRegistration(registerStatus: 401)

        await client.prepareAttestation()

        XCTAssertNil(attest.persisted)
        XCTAssertNil(attest.keyId)
    }

    func testRegistrationIsSkippedOnceAKeyExists() async {
        attest.keyId = "already-registered"
        respondToRegistration()

        await client.prepareAttestation()

        XCTAssertTrue(StubURLProtocol.recorded.isEmpty)
        XCTAssertNil(attest.attestedChallenge)
    }

    func testRegistrationIsSkippedOnAnUnsupportedDevice() async {
        attest.isSupported = false
        respondToRegistration()

        await client.prepareAttestation()

        XCTAssertTrue(StubURLProtocol.recorded.isEmpty)
    }

    func testAFailedKeyGenerationIsSwallowed() async {
        attest.generateKeyError = StubError.boom
        respondToRegistration()

        await client.prepareAttestation()

        XCTAssertNil(attest.persisted)
        XCTAssertTrue(StubURLProtocol.recorded.isEmpty)
    }
}
