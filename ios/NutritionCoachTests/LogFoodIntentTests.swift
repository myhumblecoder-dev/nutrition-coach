import XCTest
@testable import NutritionCoach

/// The intent has no screen, so every outcome has to be something worth
/// hearing. These assert the sentence, not just that it did not crash.
@MainActor
final class LogFoodIntentTests: XCTestCase {
    private var client: APIClient!

    override func setUp() {
        super.setUp()
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        client = APIClient(
            baseURL: URL(string: "https://example.com")!,
            session: URLSession(configuration: config),
            tokenStore: InMemoryTokenStore(token: "session-abc")
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

    private func spoken(_ food: String) async throws -> String {
        try await client.logSpoken(food)
    }

    func testItSpeaksWhatTheServerSaidWasLogged() async throws {
        // The copy comes from the server so pluralisation and the coach's
        // register have one home. The client must not invent its own.
        respond(200, #"{"spoken":"Logged 1 meal."}"#)

        let said = try await spoken("two eggs")

        XCTAssertEqual(said, "Logged 1 meal.")
    }

    func testItSendsTheSpokenTextToTheLogRoute() async throws {
        respond(200, #"{"spoken":"Logged 1 meal."}"#)

        _ = try await spoken("a second serving of chocolate cake")

        let request = try XCTUnwrap(StubURLProtocol.lastRequest)
        XCTAssertEqual(request.url?.path, "/api/v1/log")
        let body = try XCTUnwrap(StubURLProtocol.bodyData(from: request))
        XCTAssertTrue(
            String(decoding: body, as: UTF8.self).contains("a second serving of chocolate cake")
        )
    }

    func testACapIsReportedInTheCoachsOwnWords() async throws {
        // Not "that failed". A cap explains itself, and the explanation is the
        // useful part when there is no screen.
        respond(429, #"{"error":"Honey, we have talked enough today.","code":"capped"}"#)

        do {
            _ = try await spoken("two eggs")
            XCTFail("expected a limit error")
        } catch APIError.limitReached(let message) {
            XCTAssertTrue(message.contains("talked enough"))
        }
    }

    func testAnAbsentSubscriptionIsReportedInTheServersWords() async throws {
        respond(402, #"{"error":"Subscribe and I'll keep reading your plates.","code":"subscription_required"}"#)

        do {
            _ = try await spoken("two eggs")
            XCTFail("expected a subscription error")
        } catch APIError.subscriptionRequired(let message) {
            XCTAssertTrue(message.contains("Subscribe"))
        }
    }

    func testNoSessionIsDistinguishableFromEverythingElse() async throws {
        // "Open Roughly and sign in" is actionable; "something went wrong" is
        // not, and by voice the user cannot see which it is.
        let signedOut = APIClient(
            baseURL: URL(string: "https://example.com")!,
            session: URLSession(configuration: .ephemeral),
            tokenStore: InMemoryTokenStore(token: nil)
        )

        do {
            _ = try await signedOut.logSpoken("two eggs")
            XCTFail("expected notSignedIn")
        } catch APIError.notSignedIn {
            // as expected
        }
    }
}

/// The one-shot path differs from the two-turn one only in how the words
/// arrive. These pin that, so a future change cannot let the two diverge
/// quietly — the whole point of the shared `log` is that a difference in
/// behaviour means Siri heard something different, not that the code forked.
@MainActor
final class SpokenFoodQueryTests: XCTestCase {
    func testItHandsBackWhateverWasSaid() async throws {
        // No matching, no lookup, no list of foods. The string is the answer —
        // that is the entire trick that gets free text through a phrase
        // parameter Siri would otherwise refuse.
        let found = try await SpokenFoodQuery().entities(
            matching: "a second serving of chocolate cake"
        )

        XCTAssertEqual(found.count, 1)
        XCTAssertEqual(found.first?.text, "a second serving of chocolate cake")
    }

    func testItTrimsWhatSiriHandsOver() async throws {
        let found = try await SpokenFoodQuery().entities(matching: "  two eggs  ")

        XCTAssertEqual(found.first?.text, "two eggs")
    }

    func testSilenceMatchesNothing() async throws {
        // An empty entity would reach the server as an empty log, and the
        // route would reject it — but failing here is cheaper and quieter.
        let found = try await SpokenFoodQuery().entities(matching: "   ")

        XCTAssertTrue(found.isEmpty)
    }

    func testAnIdentifierRoundTripsAsItsOwnText() async throws {
        // The identifier *is* the text, so a repeated shortcut resolves to the
        // same words rather than to nothing.
        let found = try await SpokenFoodQuery().entities(for: ["two eggs"])

        XCTAssertEqual(found.first?.text, "two eggs")
    }

    func testThereIsNothingToSuggest() async throws {
        // There is no list of foods. Suggesting anything would imply one.
        let suggested = try await SpokenFoodQuery().suggestedEntities()

        XCTAssertTrue(suggested.isEmpty)
    }
}
