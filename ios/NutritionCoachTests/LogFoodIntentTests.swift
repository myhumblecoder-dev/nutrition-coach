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
