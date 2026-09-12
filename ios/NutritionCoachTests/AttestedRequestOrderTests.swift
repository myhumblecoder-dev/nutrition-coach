import XCTest
@testable import NutritionCoach

/// A shared, ordered log so a test can see how signing and sending interleaved.
final class EventLog: @unchecked Sendable {
    private let lock = NSLock()
    private(set) var events: [String] = []

    func record(_ event: String) {
        lock.lock()
        defer { lock.unlock() }
        events.append(event)
    }
}

/// Signs like the real thing and reports when it did.
private final class LoggingAttestService: AttestProviding {
    var isSupported = true
    var keyId: String? = "key-1"
    private let log: EventLog
    private let counter = Counter()

    init(log: EventLog) { self.log = log }

    private final class Counter: @unchecked Sendable {
        private let lock = NSLock()
        private var value = 0
        func next() -> Int {
            lock.lock(); defer { lock.unlock() }
            value += 1
            return value
        }
    }

    func generateKey() async throws -> String { "key-1" }
    func attest(keyId: String, challenge: String) async throws -> String { "blob" }
    func persist(keyId: String) {}

    func assertion(keyId: String, over clientData: Data) async throws -> String {
        let n = counter.next()
        log.record("sign-\(n)")
        return "assertion-\(n)"
    }
}

/// App Attest assertions carry a counter the server requires to strictly
/// increase (`verifyRequestAssertion`, src/lib/attest.ts). With one request
/// path that was academic. A Siri intent running in the background while the
/// app is in the foreground makes it real: two assertions generated close
/// together can reach the server out of order, one is rejected with 401, and
/// `validate` maps 401 to `tokenStore.clear()` — signing the user out with no
/// explanation.
@MainActor
final class AttestedRequestOrderTests: XCTestCase {
    private var client: APIClient!
    private var log: EventLog!

    override func setUp() {
        super.setUp()
        log = EventLog()
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [OrderedStubURLProtocol.self]
        OrderedStubURLProtocol.log = log

        client = APIClient(
            baseURL: URL(string: "https://example.com")!,
            session: URLSession(configuration: config),
            tokenStore: InMemoryTokenStore(token: "session-abc"),
            attest: LoggingAttestService(log: log)
        )
    }

    override func tearDown() {
        OrderedStubURLProtocol.log = nil
        super.tearDown()
    }

    func testAnAttestedRequestCompletesBeforeTheNextIsSigned() async throws {
        // The ordering that matters. Unserialised, both requests sign before
        // either lands — sign-1, sign-2, send-1, send-2 — and whichever
        // arrives second may carry the lower counter.
        async let first = client.logSpoken("two eggs")
        async let second = client.logSpoken("a banana")
        _ = try? await (first, second)

        let events = log.events
        XCTAssertEqual(events.count, 4, "expected two signings and two sends, got \(events)")

        // Each signing is immediately followed by its own send.
        XCTAssertTrue(events[0].hasPrefix("sign"), "got \(events)")
        XCTAssertTrue(events[1].hasPrefix("send"), "signing ran twice before either send: \(events)")
        XCTAssertTrue(events[2].hasPrefix("sign"), "got \(events)")
        XCTAssertTrue(events[3].hasPrefix("send"), "got \(events)")
    }
}

/// Records when a request actually reached the wire, and stalls briefly so an
/// unserialised second request would overtake it.
final class OrderedStubURLProtocol: URLProtocol {
    nonisolated(unsafe) static var log: EventLog?
    private static let counter = NSLock()
    nonisolated(unsafe) private static var sent = 0

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.counter.lock()
        Self.sent += 1
        let n = Self.sent
        Self.counter.unlock()

        Thread.sleep(forTimeInterval: 0.05)
        Self.log?.record("send-\(n)")

        let response = HTTPURLResponse(
            url: request.url!, statusCode: 200, httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(#"{"spoken":"Logged 1 meal.","recorded":{}}"#.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
