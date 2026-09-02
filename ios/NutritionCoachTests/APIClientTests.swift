import XCTest
@testable import NutritionCoach

/// Stubs the transport so these exercise real request construction and real
/// JSON decoding without touching the network.
final class StubURLProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) -> (Int, Data))?
    nonisolated(unsafe) static var lastRequest: URLRequest?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lastRequest = request
        let (status, data) = Self.handler?(request) ?? (200, Data())
        let response = HTTPURLResponse(
            url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

final class APIClientTests: XCTestCase {
    private var store: InMemoryTokenStore!
    private var client: APIClient!

    override func setUp() {
        super.setUp()
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        store = InMemoryTokenStore(token: "session-abc")
        client = APIClient(
            baseURL: URL(string: "https://nutrition-coach-omega.vercel.app")!,
            session: URLSession(configuration: config),
            tokenStore: store
        )
    }

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.lastRequest = nil
        super.tearDown()
    }

    private func respond(_ status: Int, _ json: String) {
        StubURLProtocol.handler = { _ in (status, Data(json.utf8)) }
    }

    // MARK: - Auth

    func testSignInStoresTheReturnedToken() async throws {
        store.clear()
        respond(200, """
        {"token":"new-token","expires":"2027-01-01T00:00:00.000Z",
         "user":{"id":"u1","email":"a@b.c","name":null}}
        """)

        let result = try await client.signInWithApple(identityToken: "apple-jwt")

        XCTAssertEqual(result.user.id, "u1")
        XCTAssertEqual(store.read(), "new-token", "the session token must be persisted")
        XCTAssertTrue(client.isSignedIn)
    }

    func testSignInDecodesANullName() async throws {
        // Apple omits the name on every sign-in after the first.
        store.clear()
        respond(200, """
        {"token":"t","expires":"2027-01-01T00:00:00.000Z",
         "user":{"id":"u1","email":null,"name":null}}
        """)

        let result = try await client.signInWithApple(identityToken: "apple-jwt")

        XCTAssertNil(result.user.name)
        XCTAssertNil(result.user.email)
    }

    func testSignOutClearsTheTokenEvenIfTheRequestFails() async {
        respond(500, "{}")

        await client.signOut()

        XCTAssertNil(store.read(), "a failed revoke must still sign the device out locally")
        XCTAssertFalse(client.isSignedIn)
    }

    // MARK: - Requests

    func testAuthenticatedRequestsCarryTheBearerToken() async throws {
        respond(200, #"{"meals":[],"target":null,"consumed":{"calories":0,"protein":0}}"#)

        _ = try await client.today()

        XCTAssertEqual(
            StubURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"),
            "Bearer session-abc"
        )
    }

    func testRequestingWithoutATokenFailsBeforeHittingTheNetwork() async {
        store.clear()
        StubURLProtocol.handler = { _ in XCTFail("must not reach the network"); return (200, Data()) }

        do {
            _ = try await client.today()
            XCTFail("expected notSignedIn")
        } catch {
            XCTAssertEqual(error as? APIError, .notSignedIn)
        }
    }

    func testA401ClearsTheStoredTokenSoTheAppReturnsToSignIn() async {
        respond(401, #"{"error":"Unauthorized"}"#)

        do {
            _ = try await client.today()
            XCTFail("expected unauthorized")
        } catch {
            XCTAssertEqual(error as? APIError, .unauthorized)
        }
        XCTAssertNil(store.read(), "a revoked session must not linger in the Keychain")
    }

    // MARK: - Decoding

    func testTodayDecodesStructuredFoodItemsAndDates() async throws {
        respond(200, """
        {"meals":[{"id":"m1",
          "foodItems":[{"name":"eggs","portion":"2","calories":140,"protein":12}],
          "totalCalories":140,"totalProtein":12,
          "photoUrl":null,"loggedAt":"2026-09-02T15:04:05.000Z","source":"extracted"}],
         "target":{"calories":2000,"protein":150},
         "consumed":{"calories":140,"protein":12}}
        """)

        let today = try await client.today()

        XCTAssertEqual(today.meals.first?.foodItems.first?.name, "eggs")
        XCTAssertNil(today.meals.first?.photoUrl, "a chat-logged meal has no photo")
        XCTAssertEqual(today.target?.calories, 2000)
        XCTAssertEqual(
            today.meals.first?.loggedAt,
            Date(timeIntervalSince1970: 1_788_361_445),
            "ISO-8601 with milliseconds must decode"
        )
    }

    func testChatHistoryDecodesAndIdentifiesCoachMessages() async throws {
        respond(200, """
        {"messages":[
          {"id":"c1","role":"user","content":"hi","createdAt":"2026-09-02T12:00:00.000Z"},
          {"id":"c2","role":"assistant","content":"hello","createdAt":"2026-09-02T12:00:01.000Z"}]}
        """)

        let messages = try await client.chatHistory()

        XCTAssertEqual(messages.count, 2)
        XCTAssertFalse(messages[0].isFromCoach)
        XCTAssertTrue(messages[1].isFromCoach)
    }

    func testSendMessagePostsTheTextAndReturnsTheReply() async throws {
        respond(200, #"{"assistantReply":"Sounds good."}"#)

        let reply = try await client.sendMessage("had eggs")

        XCTAssertEqual(reply, "Sounds good.")
        XCTAssertEqual(StubURLProtocol.lastRequest?.httpMethod, "POST")
        XCTAssertTrue(
            StubURLProtocol.lastRequest?.url?.path.hasSuffix("/api/v1/chat") ?? false
        )
    }

    func testRegisterDeviceSurfacesAServerError() async {
        respond(500, "{}")

        do {
            try await client.registerDevice(token: String(repeating: "a", count: 64))
            XCTFail("expected badStatus")
        } catch {
            XCTAssertEqual(error as? APIError, .badStatus(500))
        }
    }
}

// MARK: - Weekly check-in

extension APIClientTests {
    func testCheckInsDecodesCurrentQuestionAndHistory() async throws {
        respond(200, """
        {"current":{"weekOf":"2026-08-31T04:00:00.000Z","complete":false,
                    "nextField":"sleep","nextQuestion":"How have you been sleeping?"},
         "history":[{"weekOf":"2026-08-24T04:00:00.000Z","complete":true,
           "body":{"answer":"about the same","said":"jeans fit the same"},
           "strength":{"answer":"stronger","said":"lifts went up"},
           "sleep":{"answer":"worse","said":"kid was up a lot"},
           "mood":{"answer":"flat","said":"just tired"}}]}
        """)

        let response = try await client.checkIns()

        XCTAssertEqual(response.current.nextField, "sleep")
        XCTAssertFalse(response.current.complete)
        XCTAssertEqual(response.history.first?.strength.said, "lifts went up",
                       "the verbatim answer is the receipt and must survive decoding")
        XCTAssertTrue(response.history.first?.body.isAnswered ?? false)
    }

    func testAnUnansweredFieldDecodesAsNulls() async throws {
        respond(200, """
        {"current":{"weekOf":"2026-08-31T04:00:00.000Z","complete":false,
                    "nextField":"body","nextQuestion":"Do you feel fatter, thinner, or about the same?"},
         "history":[{"weekOf":"2026-08-31T04:00:00.000Z","complete":false,
           "body":{"answer":null,"said":null},
           "strength":{"answer":null,"said":null},
           "sleep":{"answer":null,"said":null},
           "mood":{"answer":null,"said":null}}]}
        """)

        let response = try await client.checkIns()

        XCTAssertFalse(response.history.first?.body.isAnswered ?? true)
    }

    func testAnsweringPostsTheTextAndReturnsTheNextQuestion() async throws {
        respond(200, """
        {"complete":false,"recorded":{"field":"body","answer":"a bit leaner"},
         "reply":"Nice — why do you think that is?","nextQuestion":"And stronger, weaker, or about the same?"}
        """)

        let result = try await client.answerCheckIn("jeans feel looser")

        XCTAssertEqual(result.recorded?.field, "body")
        XCTAssertEqual(result.nextQuestion, "And stronger, weaker, or about the same?")
        XCTAssertEqual(StubURLProtocol.lastRequest?.httpMethod, "POST")
    }

    func testAnsweringToleratesAMissingReply() async throws {
        // The server saves the answer even when reply generation fails.
        respond(200, #"{"complete":true,"recorded":{"field":"mood","answer":"good"},"reply":null,"nextQuestion":null}"#)

        let result = try await client.answerCheckIn("good")

        XCTAssertNil(result.reply)
        XCTAssertTrue(result.complete)
    }
}
