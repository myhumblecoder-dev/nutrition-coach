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

    /// URLProtocol replaces `httpBody` with a stream, so both are checked.
    /// Shared rather than private to one test class: asserting on a request
    /// body is something every suite here needs, and a second hand-rolled
    /// drain would be a second chance to get it subtly wrong.
    static func bodyData(from request: URLRequest) -> Data? {
        if let stream = request.httpBodyStream {
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
        }
        return request.httpBody
    }
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

// MARK: - Dashboard

extension APIClientTests {
    private var dashboardJSON: String {
        """
        {"today":{"meals":[{"id":"m1","foodItems":[{"name":"Baozi","portion":"5","calories":600,"protein":25}],
          "totalCalories":600,"totalProtein":25,"photoUrl":null,
          "loggedAt":"2026-09-06T13:17:00.000Z","source":"extracted"}],
          "target":{"calories":2000,"protein":150},"consumed":{"calories":1085,"protein":62}},
         "week":{"training":{"resistance":3,"hiit":1,"core":2,"stepsToday":6540,
           "days":{"resistance":[true,false,true,false,true,false,false],
                   "hiit":[false,true,false,false,false,false,false],
                   "core":[true,false,false,true,false,false,false]}},
          "recovery":{"sleepHours":7.5,"waterLiters":2.5,"caffeine":null},
          "streak":[true,true,false,true,true,true,true],
          "weights":[{"at":"2026-08-29T08:00:00.000Z","weightLb":172.8},
                     {"at":"2026-09-06T08:00:00.000Z","weightLb":172.0}],
          "mood":{"score":4,"note":"good energy"},
          "measurement":{"weightLb":172.0,"waistIn":null}},
         "activity":[{"id":"a1","at":"2026-09-06T20:32:00.000Z",
           "sourceText":"went for a 45 minute walk in the park","source":"extracted",
           "kind":"training","label":"NEAT · 45 min walk","photoUrl":null}],
         "coachMessage":"Protein is the lever today."}
        """
    }

    func testDashboardArrivesInOneRequest() async throws {
        respond(200, dashboardJSON)

        let data = try await client.dashboard()

        XCTAssertEqual(StubURLProtocol.recorded.count, 1,
                       "the whole screen is one round trip; a phone should not pay four")
        XCTAssertEqual(StubURLProtocol.lastRequest?.url?.path, "/api/v1/dashboard")
        XCTAssertEqual(data.today.consumed.calories, 1085)
        XCTAssertEqual(data.today.target?.protein, 150)
    }

    func testReceiptsCarryTheWordsThatProducedThem() async throws {
        // The feed is the evidence that a number came from the conversation.
        // Losing sourceText would leave the claim unsupported.
        respond(200, dashboardJSON)

        let data = try await client.dashboard()
        let receipt = try XCTUnwrap(data.activity.first)

        XCTAssertEqual(receipt.sourceText, "went for a 45 minute walk in the park")
        XCTAssertEqual(receipt.label, "NEAT · 45 min walk")
        XCTAssertTrue(receipt.isFromConversation, "source 'extracted' is the via-chat badge")
    }

    func testTheViaChatBadgeTracksTheSourceField() throws {
        // Decoded directly rather than by patching the big fixture: the first
        // version of this test did a string replacement that silently failed
        // to match, so it asserted nothing while passing for the wrong reason.
        func item(source: String) throws -> ActivityItem {
            let json = """
            {"id":"a1","at":"2026-09-06T20:32:00.000Z","sourceText":"a walk",
             "source":"\(source)","kind":"training","label":"NEAT","photoUrl":null}
            """
            return try JSONDecoder.api.decode(ActivityItem.self, from: Data(json.utf8))
        }

        XCTAssertTrue(try item(source: "extracted").isFromConversation)
        XCTAssertFalse(try item(source: "manual").isFromConversation,
                       "a row the user created directly is not a conversation receipt")
    }

    func testWeekDecodesTheGraphSeries() async throws {
        respond(200, dashboardJSON)

        let week = try await client.dashboard().week

        XCTAssertEqual(week.training.resistance, 3)
        XCTAssertEqual(week.training.stepsToday, 6540)
        XCTAssertEqual(week.streak.filter { $0 }.count, 6, "six of seven days logged")
        XCTAssertEqual(week.weights.map(\.weightLb), [172.8, 172.0])
        XCTAssertEqual(week.mood?.score, 4)
        XCTAssertEqual(week.measurement?.weightLb, 172.0)
    }

    func testAbsentRecoveryReadingsDecodeAsNilRatherThanZero() async throws {
        // Nothing logged and zero hours' sleep are different facts, and the UI
        // renders the first as an em dash.
        respond(200, dashboardJSON.replacingOccurrences(
            of: "\"sleepHours\":7.5,\"waterLiters\":2.5",
            with: "\"sleepHours\":null,\"waterLiters\":null"))

        let week = try await client.dashboard().week

        XCTAssertNil(week.recovery.sleepHours)
        XCTAssertNil(week.recovery.waterLiters)
    }

    func testTheCoachLineSurvivesForTheStrip() async throws {
        respond(200, dashboardJSON)

        let data = try await client.dashboard()

        XCTAssertEqual(data.coachMessage, "Protein is the lever today.")
    }

    // MARK: - Reporting a coach reply

    func testReportSendsTheTextTheUserActuallySaw() async throws {
        respond(200, #"{"ok":true}"#)

        try await client.reportMessage("something objectionable", messageId: "m1")

        let request = try XCTUnwrap(StubURLProtocol.lastRequest)
        XCTAssertEqual(request.url?.path, "/api/v1/reports")
        XCTAssertEqual(request.httpMethod, "POST")

        let body = try XCTUnwrap(Self.bodyData(from: request))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
        XCTAssertEqual(json["content"], "something objectionable")
        XCTAssertEqual(json["messageId"], "m1")
    }

    func testReportOmitsAnOptimisticLocalId() async throws {
        // A reply shown before the reload has a client-side id the server has
        // never seen. Sending it would file a report pointing at nothing.
        respond(200, #"{"ok":true}"#)

        try await client.reportMessage("something objectionable", messageId: "local-ABC123")

        let body = try XCTUnwrap(Self.bodyData(from: try XCTUnwrap(StubURLProtocol.lastRequest)))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
        XCTAssertNil(json["messageId"])
        XCTAssertEqual(json["content"], "something objectionable")
    }

    // MARK: - Meal photos

    /// Not a real JPEG — the client never decodes it, it only carries it. What
    /// matters is that the bytes arrive intact on the other side.
    private static let photoBytes = Data([0xFF, 0xD8, 0xFF, 0xDB, 0x00, 0x43, 0xFF, 0xD9])

    private func respondWithAnalysis() {
        respond(200, """
        {"mealId":"meal-1","photoUrl":"https://blob/meal.jpg",
         "foodItems":[{"name":"eggs","portion":"2 large","calories":140,"protein":12}],
         "totalCalories":140,"totalProtein":12}
        """)
    }

    func testAnalyzingAPhotoPostsTheBytesAndDecodesTheAnalysis() async throws {
        respondWithAnalysis()

        let analysis = try await client.analyzeMealPhoto(jpeg: Self.photoBytes, hint: "two eggs")

        XCTAssertEqual(analysis.mealId, "meal-1")
        XCTAssertEqual(analysis.foodItems.first?.name, "eggs")
        XCTAssertEqual(analysis.totalCalories, 140)

        let request = try XCTUnwrap(StubURLProtocol.lastRequest)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/api/v1/meals/photo")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer session-abc")

        let body = try XCTUnwrap(Self.bodyData(from: request))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
        // Base64 in JSON rather than a multipart body, so App Attest can sign
        // over exactly the bytes the server verifies as text.
        XCTAssertEqual(Data(base64Encoded: try XCTUnwrap(json["image"])), Self.photoBytes)
        XCTAssertEqual(json["mimeType"], "image/jpeg")
        XCTAssertEqual(json["hint"], "two eggs")
    }

    func testAPhotoWithNoHintOmitsTheKeyEntirely() async throws {
        respondWithAnalysis()

        _ = try await client.analyzeMealPhoto(jpeg: Self.photoBytes, hint: nil)

        let body = try XCTUnwrap(Self.bodyData(from: try XCTUnwrap(StubURLProtocol.lastRequest)))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
        // Not an empty string: the server treats a hint as the user's own
        // words about the food, and "" is not something anyone said.
        XCTAssertNil(json["hint"])
    }

    func testTheDailyPhotoCapReachesTheUserInItsOwnWords() async {
        respond(429, #"{"error":"That's plenty of photos for today — back tomorrow."}"#)

        do {
            _ = try await client.analyzeMealPhoto(jpeg: Self.photoBytes, hint: nil)
            XCTFail("expected limitReached")
        } catch {
            // A cap is not a failure to send. Collapsing it into a generic
            // error would tell someone to retake a photo that was fine.
            XCTAssertEqual(
                error as? APIError,
                .limitReached("That's plenty of photos for today — back tomorrow.")
            )
        }
        XCTAssertEqual(store.read(), "session-abc", "a cap must not sign anyone out")
    }

    func testA429WithNoMessageStillFailsRatherThanInventingCopy() async {
        respond(429, "{}")

        do {
            _ = try await client.analyzeMealPhoto(jpeg: Self.photoBytes, hint: nil)
            XCTFail("expected a thrown error")
        } catch {
            XCTAssertEqual(error as? APIError, .badStatus(429))
        }
    }

    func testAnExpiredSessionStillSignsOutOnThePhotoPath() async {
        respond(401, #"{"error":"Unauthorized"}"#)

        do {
            _ = try await client.analyzeMealPhoto(jpeg: Self.photoBytes, hint: nil)
            XCTFail("expected unauthorized")
        } catch {
            XCTAssertEqual(error as? APIError, .unauthorized)
        }
        XCTAssertNil(store.read())
    }

    func testConfirmingSendsTheCorrectedTotals() async throws {
        respond(200, #"{"ok":true}"#)

        try await client.confirmMeal(id: "meal-1", totalCalories: 500, totalProtein: 40)

        let request = try XCTUnwrap(StubURLProtocol.lastRequest)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/api/v1/meals/meal-1/confirm")

        let body = try XCTUnwrap(Self.bodyData(from: request))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Int])
        XCTAssertEqual(json["totalCalories"], 500)
        XCTAssertEqual(json["totalProtein"], 40)
    }

    func testDiscardingDeletesThePendingMeal() async throws {
        respond(200, #"{"ok":true}"#)

        try await client.discardMeal(id: "meal-1")

        let request = try XCTUnwrap(StubURLProtocol.lastRequest)
        XCTAssertEqual(request.httpMethod, "DELETE")
        XCTAssertEqual(request.url?.path, "/api/v1/meals/meal-1")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer session-abc")
    }

    func testConfirmingAMealThatIsNoLongerPendingFails() async {
        respond(404, #"{"error":"That meal's no longer pending."}"#)

        do {
            try await client.confirmMeal(id: "gone", totalCalories: 1, totalProtein: 1)
            XCTFail("expected a thrown error")
        } catch {
            XCTAssertEqual(error as? APIError, .badStatus(404))
        }
    }

    func testCorrectingAMealPostsTheWordsAndReturnsAFreshEstimate() async throws {
        respond(200, """
        {"mealId":"meal-1","photoUrl":"https://blob/meal.jpg",
         "foodItems":[{"name":"chicken","portion":"2 cups","calories":700,"protein":60}],
         "totalCalories":700,"totalProtein":60}
        """)

        let revised = try await client.reviseMeal(id: "meal-1", correction: "that's chicken")

        XCTAssertEqual(revised.totalCalories, 700)
        XCTAssertEqual(revised.foodItems.first?.name, "chicken")

        let request = try XCTUnwrap(StubURLProtocol.lastRequest)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/api/v1/meals/meal-1/revise")

        let body = try XCTUnwrap(Self.bodyData(from: request))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
        XCTAssertEqual(json["correction"], "that's chicken")
    }

    func testCorrectingAMealThatIsNoLongerPendingFails() async {
        respond(404, #"{"error":"That meal's no longer pending."}"#)

        do {
            _ = try await client.reviseMeal(id: "gone", correction: "x")
            XCTFail("expected a thrown error")
        } catch {
            XCTAssertEqual(error as? APIError, .badStatus(404))
        }
    }

    func testTheCapAppliesToCorrectionsToo() async {
        respond(429, #"{"error":"That's plenty of photos for today."}"#)

        do {
            _ = try await client.reviseMeal(id: "meal-1", correction: "x")
            XCTFail("expected limitReached")
        } catch {
            // A correction is another vision call, so it can hit the same cap.
            XCTAssertEqual(error as? APIError, .limitReached("That's plenty of photos for today."))
        }
    }

    // MARK: - Timezone

    func testFetchingTheTimezoneReadsWhatTheServerHasStored() async throws {
        respond(200, #"{"timezone":"Europe/London"}"#)

        let zone = try await client.timezone()

        XCTAssertEqual(zone, "Europe/London")
        XCTAssertEqual(StubURLProtocol.lastRequest?.httpMethod, "GET")
        XCTAssertEqual(StubURLProtocol.lastRequest?.url?.path, "/api/v1/timezone")
    }

    func testSettingTheTimezonePutsTheIdentifier() async throws {
        respond(200, #"{"timezone":"Asia/Tokyo"}"#)

        let saved = try await client.setTimezone("Asia/Tokyo")

        XCTAssertEqual(saved, "Asia/Tokyo")
        let request = try XCTUnwrap(StubURLProtocol.lastRequest)
        XCTAssertEqual(request.httpMethod, "PUT")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer session-abc")

        let body = try XCTUnwrap(Self.bodyData(from: request))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
        XCTAssertEqual(json["timezone"], "Asia/Tokyo")
    }

    func testAZoneTheServerRejectsSurfacesAsAnError() async {
        // The server validates the identifier; a 400 must not be swallowed
        // into a silent no-op that leaves Settings showing the wrong zone.
        respond(400, #"{"error":"Not a recognised timezone"}"#)

        do {
            _ = try await client.setTimezone("Mars/Olympus_Mons")
            XCTFail("expected a thrown error")
        } catch {
            XCTAssertEqual(error as? APIError, .badStatus(400))
        }
    }

    private static func bodyData(from request: URLRequest) -> Data? {
        StubURLProtocol.bodyData(from: request)
    }
}

