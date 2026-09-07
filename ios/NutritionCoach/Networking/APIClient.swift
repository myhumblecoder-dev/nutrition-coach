import Foundation

/// Client for the Next.js backend at /api/v1.
///
/// The app holds no service credentials of its own — no Blob token, no
/// Anthropic key. Everything goes through the backend, which is why this
/// client only ever carries a bearer session token.
final class APIClient {
    private let baseURL: URL
    private let session: URLSession
    private let tokenStore: TokenStoring
    private let attest: AttestProviding?

    private let decoder = JSONDecoder.api

    init(
        baseURL: URL,
        session: URLSession = .shared,
        tokenStore: TokenStoring,
        attest: AttestProviding? = nil
    ) {
        self.baseURL = baseURL
        self.session = session
        self.tokenStore = tokenStore
        self.attest = attest
    }

    var isSignedIn: Bool { tokenStore.read() != nil }

    // MARK: - Auth

    func signInWithApple(identityToken: String) async throws -> AuthResponse {
        let auth: AuthResponse = try await send(
            "/api/v1/auth/apple",
            method: "POST",
            body: ["identityToken": .string(identityToken)],
            authenticated: false
        )
        tokenStore.write(auth.token)
        return auth
    }

    func signOut() async {
        // The local token is cleared regardless of the server's answer: a user
        // who taps sign out must end up signed out even offline.
        defer { tokenStore.clear() }
        _ = try? await sendIgnoringResponse("/api/v1/auth/signout", method: "POST", body: [:])
    }

    /// Permanently deletes the account and everything in it.
    ///
    /// Unlike `signOut`, a failure is thrown rather than swallowed: telling
    /// someone their data is gone when the server never heard the request
    /// would be a lie. The token is cleared only once the server confirms —
    /// the delete cascades the session rows, so it is already dead by then.
    func deleteAccount() async throws {
        try await sendIgnoringResponse(
            "/api/v1/account", method: "DELETE", body: ["confirm": "DELETE"]
        )
        tokenStore.clear()
    }

    // MARK: - App Attest

    /// Generates this device's App Attest key and registers it with the server.
    ///
    /// A no-op once a key is registered, because Apple allows `attestKey` only
    /// once per key. The identifier is persisted only after the server accepts
    /// the attestation, so a failure part-way through simply retries with a
    /// fresh key next launch rather than stranding an unusable one.
    ///
    /// Errors are deliberately swallowed. While APP_ATTEST_REQUIRED is off
    /// server-side, a device that cannot attest — the Simulator, a failed
    /// round trip — must still be able to use the app. Once enforcement is on,
    /// those requests get a 401 from the server, which is the right place for
    /// that decision to be made.
    func prepareAttestation() async {
        guard let attest, attest.isSupported, attest.keyId == nil else { return }

        do {
            let keyId = try await attest.generateKey()
            let challenge = try await attestChallenge()
            let attestation = try await attest.attest(keyId: keyId, challenge: challenge)
            try await registerAttestation(
                keyId: keyId, attestation: attestation, challenge: challenge
            )
            attest.persist(keyId: keyId)
        } catch {
            print("App Attest registration failed: \(error.localizedDescription)")
        }
    }

    private func attestChallenge() async throws -> String {
        let response: AttestChallengeResponse = try await send(
            "/api/v1/attest/challenge", method: "POST", body: nil,
            authenticated: false, attested: false
        )
        return response.challenge
    }

    private func registerAttestation(
        keyId: String, attestation: String, challenge: String
    ) async throws {
        // Unauthenticated on purpose: a device attests at first launch, which
        // may be before the user has an account. The server links it to the
        // session when there is one.
        try await sendIgnoringResponse(
            "/api/v1/attest", method: "POST",
            body: ["keyId": .string(keyId), "attestation": .string(attestation), "challenge": .string(challenge)],
            authenticated: tokenStore.read() != nil, attested: false
        )
    }

    // MARK: - Data

    func today() async throws -> TodayResponse {
        try await send("/api/v1/today", method: "GET", body: nil)
    }

    /// The whole Today screen in one request. See DashboardResponse.
    func dashboard() async throws -> DashboardResponse {
        try await send("/api/v1/dashboard", method: "GET", body: nil)
    }

    func targets() async throws -> MacroPair? {
        let response: TargetResponse = try await send("/api/v1/targets", method: "GET", body: nil)
        return response.target
    }

    /// The server bounds these, so a rejection is a 400 rather than a silently
    /// stored nonsense denominator under every ring on Today.
    func setTargets(calories: Int, protein: Int) async throws -> MacroPair? {
        let response: TargetResponse = try await send(
            "/api/v1/targets", method: "PUT",
            body: ["calories": .int(calories), "protein": .int(protein)]
        )
        return response.target
    }

    func chatHistory() async throws -> [ChatMessage] {
        let response: ChatHistoryResponse = try await send("/api/v1/chat", method: "GET", body: nil)
        return response.messages
    }

    func sendMessage(_ text: String) async throws -> String {
        let response: ChatReplyResponse = try await send(
            "/api/v1/chat", method: "POST", body: ["message": .string(text)]
        )
        return response.assistantReply
    }

    func checkIns() async throws -> CheckInsResponse {
        try await send("/api/v1/checkins", method: "GET", body: nil)
    }

    func answerCheckIn(_ text: String) async throws -> CheckInReplyResponse {
        try await send("/api/v1/checkins", method: "POST", body: ["message": .string(text)])
    }

    func registerDevice(token: String) async throws {
        try await sendIgnoringResponse("/api/v1/devices", method: "POST", body: ["token": .string(token)])
    }

    func unregisterDevice(token: String) async throws {
        try await sendIgnoringResponse("/api/v1/devices", method: "DELETE", body: ["token": .string(token)])
    }

    // MARK: - Transport

    private func makeRequest(
        _ path: String, method: String, body: [String: JSONValue]?,
        authenticated: Bool, attested: Bool
    ) async throws -> URLRequest {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method

        if authenticated {
            guard let token = tokenStore.read() else { throw APIError.notSignedIn }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }

        // After the body is set: the assertion is signed over the bytes that
        // actually go on the wire.
        if attested { await attachAssertion(to: &request) }

        return request
    }

    /// Signs the request with the device's attested key, if there is one.
    ///
    /// Silent when attestation is unavailable or fails. Sending an unattested
    /// request and letting the server decide is what keeps the app working
    /// before enforcement is switched on; refusing locally would only move the
    /// same 401 earlier and break the Simulator.
    private func attachAssertion(to request: inout URLRequest) async {
        guard let attest, attest.isSupported, let keyId = attest.keyId else { return }

        // The server hashes the request body, or the path when there is no
        // body. Signing `httpBody` rather than re-serialising the dictionary
        // matters: a different key order would produce different bytes and an
        // assertion that cannot verify.
        let clientData = request.httpBody ?? Data((request.url?.path ?? "").utf8)

        guard let assertion = try? await attest.assertion(keyId: keyId, over: clientData) else {
            return
        }

        request.setValue(keyId, forHTTPHeaderField: "x-attest-key-id")
        request.setValue(assertion, forHTTPHeaderField: "x-attest-assertion")
    }

    private func validate(_ response: URLResponse) throws {
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 401 {
            // The session was revoked or expired server-side. Drop it so the
            // UI falls back to sign-in instead of retrying forever.
            tokenStore.clear()
            throw APIError.unauthorized
        }
        guard (200..<300).contains(status) else { throw APIError.badStatus(status) }
    }

    private func send<T: Decodable>(
        _ path: String, method: String, body: [String: JSONValue]?,
        authenticated: Bool = true, attested: Bool = true
    ) async throws -> T {
        let request = try await makeRequest(
            path, method: method, body: body, authenticated: authenticated, attested: attested
        )
        let (data, response) = try await session.data(for: request)
        try validate(response)
        return try decoder.decode(T.self, from: data)
    }

    @discardableResult
    private func sendIgnoringResponse(
        _ path: String, method: String, body: [String: JSONValue]?,
        authenticated: Bool = true, attested: Bool = true
    ) async throws -> Data {
        let request = try await makeRequest(
            path, method: method, body: body, authenticated: authenticated, attested: attested
        )
        let (data, response) = try await session.data(for: request)
        try validate(response)
        return data
    }
}


extension JSONDecoder {
    /// The decoder every API response is read with.
    ///
    /// Shared rather than private so a test can decode a single model without
    /// standing up a request — and so it cannot drift from what the client
    /// actually uses, which would make such a test worthless.
    static let api: JSONDecoder = {
        let decoder = JSONDecoder()
        // The API sends ISO-8601 with milliseconds (Date#toISOString), which
        // .iso8601 alone rejects.
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        decoder.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            guard let date = formatter.date(from: raw) else {
                throw DecodingError.dataCorruptedError(
                    in: try decoder.singleValueContainer(),
                    debugDescription: "Unrecognised date: \(raw)"
                )
            }
            return date
        }
        return decoder
    }()
}


/// The value types a request body can hold.
///
/// The body used to be `[String: String]`, which was fine while every field
/// was text and wrong the moment one was not: the daily target is validated
/// server-side as an integer, and `"2000"` is a 400. An enum keeps the call
/// sites honest without widening to `Any`, which would lose Sendable and move
/// the failure to runtime.
enum JSONValue: Encodable, Equatable, Sendable {
    case string(String)
    case int(Int)

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .int(let value): try container.encode(value)
        }
    }
}

extension JSONValue: ExpressibleByStringLiteral {
    /// So existing call sites keep reading as `["message": text]`.
    init(stringLiteral value: String) { self = .string(value) }
}
