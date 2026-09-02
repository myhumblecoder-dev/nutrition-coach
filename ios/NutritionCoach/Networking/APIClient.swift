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

    private let decoder: JSONDecoder = {
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

    init(baseURL: URL, session: URLSession = .shared, tokenStore: TokenStoring) {
        self.baseURL = baseURL
        self.session = session
        self.tokenStore = tokenStore
    }

    var isSignedIn: Bool { tokenStore.read() != nil }

    // MARK: - Auth

    func signInWithApple(identityToken: String) async throws -> AuthResponse {
        let auth: AuthResponse = try await send(
            "/api/v1/auth/apple",
            method: "POST",
            body: ["identityToken": identityToken],
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

    // MARK: - Data

    func today() async throws -> TodayResponse {
        try await send("/api/v1/today", method: "GET", body: nil)
    }

    func chatHistory() async throws -> [ChatMessage] {
        let response: ChatHistoryResponse = try await send("/api/v1/chat", method: "GET", body: nil)
        return response.messages
    }

    func sendMessage(_ text: String) async throws -> String {
        let response: ChatReplyResponse = try await send(
            "/api/v1/chat", method: "POST", body: ["message": text]
        )
        return response.assistantReply
    }

    func registerDevice(token: String) async throws {
        try await sendIgnoringResponse("/api/v1/devices", method: "POST", body: ["token": token])
    }

    func unregisterDevice(token: String) async throws {
        try await sendIgnoringResponse("/api/v1/devices", method: "DELETE", body: ["token": token])
    }

    // MARK: - Transport

    private func makeRequest(
        _ path: String, method: String, body: [String: String]?, authenticated: Bool
    ) throws -> URLRequest {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method

        if authenticated {
            guard let token = tokenStore.read() else { throw APIError.notSignedIn }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        return request
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
        _ path: String, method: String, body: [String: String]?, authenticated: Bool = true
    ) async throws -> T {
        let request = try makeRequest(path, method: method, body: body, authenticated: authenticated)
        let (data, response) = try await session.data(for: request)
        try validate(response)
        return try decoder.decode(T.self, from: data)
    }

    @discardableResult
    private func sendIgnoringResponse(
        _ path: String, method: String, body: [String: String]?
    ) async throws -> Data {
        let request = try makeRequest(path, method: method, body: body, authenticated: true)
        let (data, response) = try await session.data(for: request)
        try validate(response)
        return data
    }
}
