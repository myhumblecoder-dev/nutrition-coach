#if DEBUG
import Foundation

/// Fixture transport for App Store screenshots.
///
/// Entirely inside `#if DEBUG`, so none of this exists in a Release binary —
/// screenshot scaffolding that could ship is a liability, and a compile-time
/// fence is the only guarantee worth having.
///
/// It stubs the transport rather than the views: every screen still runs its
/// real `load()`, its real decoding and its real layout, so a shot cannot show
/// a screen the app could not actually produce. The copy is the coach's own
/// voice and the check-in questions are the verbatim strings from
/// `src/lib/checkin.ts`.
enum DemoMode {
    static var isActive: Bool {
        ProcessInfo.processInfo.arguments.contains("-demo-data")
    }

    /// Which tab to open on launch, so each screen can be captured by
    /// relaunching rather than by driving the UI.
    static var initialTab: Int {
        guard let index = ProcessInfo.processInfo.arguments.firstIndex(of: "-demo-tab"),
              index + 1 < ProcessInfo.processInfo.arguments.count,
              let tab = Int(ProcessInfo.processInfo.arguments[index + 1])
        else { return 0 }
        return tab
    }

    static func makeClient() -> APIClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [DemoURLProtocol.self]
        return APIClient(
            baseURL: AppState.productionURL,
            session: URLSession(configuration: config),
            // A token so `isSignedIn` is true: the screenshots are of the
            // signed-in app, and the sign-in screen is captured separately by
            // launching without `-demo-data`.
            tokenStore: InMemoryTokenStore(token: "demo-session"),
            attest: nil
        )
    }
}

final class DemoURLProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let path = request.url?.path ?? ""
        let body = Data(DemoFixtures.json(for: path, method: request.httpMethod ?? "GET").utf8)
        let response = HTTPURLResponse(
            url: request.url!, statusCode: 200, httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

enum DemoFixtures {
    // Fixed, not relative to now: a screenshot set has to be reproducible
    // months later, and "August 24" in the Review shot must not silently
    // become a different week on the next run.
    //
    // Midday UTC rather than midnight, so the day renders the same from the
    // Americas through Asia. ReviewView formats weekOf in device-local time,
    // so a midnight-UTC fixture labels the week a day early on any machine
    // west of Greenwich and the shot stops being reproducible. That the real
    // app has the same sensitivity is a bug in its own right — see
    // REVIEW-NOTES.md.
    private static let thisWeek = "2026-08-31T12:00:00.000Z"
    private static let lastWeek = "2026-08-24T12:00:00.000Z"
    private static let weekBefore = "2026-08-17T12:00:00.000Z"

    static func json(for path: String, method: String) -> String {
        switch path {
        case "/api/v1/chat" where method == "GET": return chat
        case "/api/v1/checkins" where method == "GET": return checkIns
        default: return #"{"ok":true}"#
        }
    }

    /// Conversation is the logging surface — the coach mines it for meals and
    /// training — so this exchange shows logging happening by talking, and the
    /// coach being explicit that the numbers are estimates.
    private static let chat = """
    {"messages":[
      {"id":"m1","role":"user","content":"Had a chicken burrito bowl for lunch, no rice. And I lifted this morning.","createdAt":"2026-09-04T16:12:04.000Z"},
      {"id":"m2","role":"assistant","content":"Chicken and beans, no rice. That'll do, hon. Logged it. What'd you lift?","createdAt":"2026-09-04T16:12:09.000Z"},
      {"id":"m3","role":"user","content":"Squats and rows. Felt heavy today.","createdAt":"2026-09-04T16:13:41.000Z"},
      {"id":"m4","role":"assistant","content":"You slept five hours Tuesday and you're still catching up. Heavy is what that feels like. It's not a setback, it's a Thursday.","createdAt":"2026-09-04T16:13:48.000Z"},
      {"id":"m5","role":"user","content":"Fair. Am I getting enough protein?","createdAt":"2026-09-04T16:14:22.000Z"},
      {"id":"m6","role":"assistant","content":"Roughly, yeah — somewhere near 140 grams most days. And I do mean roughly. That number on the chicken package is a legal tolerance, not a measurement. Keep doing what you're doing.","createdAt":"2026-09-04T16:14:31.000Z"}
    ]}
    """

    /// `nextQuestion` is the verbatim string from QUESTIONS.body in
    /// src/lib/checkin.ts. A screenshot showing wording the app never uses
    /// would be a small lie in the place it matters most.
    private static let checkIns = """
    {
      "current": {
        "weekOf":"\(thisWeek)","complete":false,
        "nextField":"body",
        "nextQuestion":"Alright, week's up. Fatter, thinner, or about the same?"
      },
      "history":[
        {"weekOf":"\(lastWeek)","complete":true,
         "body":{"answer":"About the same","said":"about the same honestly, maybe a bit leaner"},
         "strength":{"answer":"Stronger","said":"stronger for sure, put 10lb on my squat"},
         "sleep":{"answer":"Poor","said":"rough, the kid was up twice most nights"},
         "mood":{"answer":"Good","said":"good actually, work finally calmed down"}},
        {"weekOf":"\(weekBefore)","complete":true,
         "body":{"answer":"Leaner","said":"leaner, my jeans fit better"},
         "strength":{"answer":"About the same","said":"same, didn't push it this week"},
         "sleep":{"answer":"Okay","said":"okay, six hours most nights"},
         "mood":{"answer":"Flat","said":"kind of flat, nothing bad, just tired"}}
      ]
    }
    """
}
#endif
