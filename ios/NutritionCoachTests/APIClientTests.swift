import XCTest
@testable import NutritionCoach

/// Stubs the transport so these exercise real request construction and real
/// JSON decoding without touching the network.
final class StubURLProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) -> (Int, Data))?
    nonisolated(unsafe) static var lastRequest: URLRequest?
    /// Every request in order. `lastRequest` is enough for a single call, but
    /// App Attest registration makes two.
    nonisolated(unsafe) static var recorded: [URLRequest] = []

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lastRequest = request
        Self.recorded.append(request)
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
        StubURLProtocol.recorded = []
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
        {"current":{"weekOf":"2026-08-31","complete":false,
                    "nextField":"sleep","nextQuestion":"How have you been sleeping?"},
         "history":[{"weekOf":"2026-08-24","complete":true,
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
        XCTAssertEqual(response.current.weekOf, CalendarDate(year: 2026, month: 8, day: 31))
        XCTAssertEqual(response.history.first?.weekOf, CalendarDate(year: 2026, month: 8, day: 24))
    }

    func testAnUnansweredFieldDecodesAsNulls() async throws {
        respond(200, """
        {"current":{"weekOf":"2026-08-31","complete":false,
                    "nextField":"body","nextQuestion":"Do you feel fatter, thinner, or about the same?"},
         "history":[{"weekOf":"2026-08-31","complete":false,
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

    // MARK: - Account deletion

    func testDeleteAccountSendsTheConfirmationAndClearsTheToken() async throws {
        respond(200, "{\"ok\":true}")

        try await client.deleteAccount()

        let request = try XCTUnwrap(StubURLProtocol.lastRequest)
        XCTAssertEqual(request.httpMethod, "DELETE")
        XCTAssertEqual(request.url?.path, "/api/v1/account")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer session-abc")

        let body = try XCTUnwrap(request.httpBodyStream.map { stream -> Data in
            stream.open()
            defer { stream.close() }
            var data = Data()
            var buffer = [UInt8](repeating: 0, count: 1024)
            while stream.hasBytesAvailable {
                let read = stream.read(&buffer, maxLength: buffer.count)
                if read <= 0 { break }
                data.append(buffer, count: read)
            }
            return data
        } ?? request.httpBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
        XCTAssertEqual(json["confirm"], "DELETE")

        XCTAssertNil(store.read(), "a deleted account must not leave a usable token behind")
    }

    func testDeleteAccountKeepsTheTokenWhenTheServerRefuses() async {
        // A 500 means the account may still exist. Throwing the token away
        // would strand the user signed out with their data still on the
        // server and no way to retry.
        respond(500, "{}")

        do {
            try await client.deleteAccount()
            XCTFail("expected a thrown error")
        } catch {
            XCTAssertEqual(store.read(), "session-abc")
        }
    }
}

// MARK: - CalendarDate

/// The regression these exist for: weekOf used to arrive as an ISO instant and
/// be rendered by an un-pinned DateFormatter, so every device west of the
/// server's timezone labelled the week a day early — "Week of August 23" for a
/// week that began on the 24th.
final class CalendarDateTests: XCTestCase {
    private func decode(_ json: String) throws -> CalendarDate {
        try JSONDecoder().decode(CalendarDate.self, from: Data(json.utf8))
    }

    func testDecodesAWireDate() throws {
        XCTAssertEqual(try decode(#""2026-08-24""#), CalendarDate(year: 2026, month: 8, day: 24))
    }

    func testRendersTheSameDayInEveryTimeZone() {
        let week = CalendarDate(year: 2026, month: 8, day: 24)

        // The label is built from components through a UTC-pinned calendar, so
        // there is no device timezone left in the path to shift it. Honolulu
        // (UTC-10) and Auckland (UTC+12) are 22 hours apart and must agree.
        XCTAssertEqual(week.monthAndDay, "August 24")

        let original = NSTimeZone.default
        defer { NSTimeZone.default = original }
        for identifier in ["Pacific/Honolulu", "America/Los_Angeles", "UTC", "Pacific/Auckland"] {
            // NSTimeZone.default is what TimeZone.current reads, so this
            // genuinely moves the device out from under the formatter.
            NSTimeZone.default = TimeZone(identifier: identifier)!
            XCTAssertEqual(
                CalendarDate(year: 2026, month: 8, day: 24).monthAndDay, "August 24",
                "the week label must not depend on where the phone is (\(identifier))"
            )
        }
    }

    func testRoundTripsThroughTheWireFormat() throws {
        let week = CalendarDate(year: 2026, month: 1, day: 5)

        let encoded = try JSONEncoder().encode(week)

        // Zero-padded, so the string sorts in the same order as the date.
        XCTAssertEqual(String(data: encoded, encoding: .utf8), #""2026-01-05""#)
        XCTAssertEqual(try decode(#""2026-01-05""#), week)
    }

    func testOrdersChronologically() {
        XCTAssertLessThan(
            CalendarDate(year: 2026, month: 8, day: 24),
            CalendarDate(year: 2026, month: 9, day: 1)
        )
    }

    func testRejectsAnInstantRatherThanSilentlyTruncatingIt() throws {
        // The old wire format. Accepting it would let the server regress to
        // sending an instant without anything failing.
        XCTAssertThrowsError(try decode(#""2026-08-24T04:00:00.000Z""#))
    }

    func testRejectsMalformedDates() throws {
        for bad in [#""2026-08""#, #""2026-13-01""#, #""2026-08-32""#, #""not-a-date""#, #""""#] {
            XCTAssertThrowsError(try decode(bad), "should reject \(bad)")
        }
    }
}

