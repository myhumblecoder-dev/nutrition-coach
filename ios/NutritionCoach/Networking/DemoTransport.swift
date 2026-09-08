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

    /// Scrolls Today to the receipts feed on load, so a screenshot can show
    /// the part of the screen that makes the product's argument.
    /// Serves the state a brand-new account actually sees: no targets, no
    /// history. Worth being able to look at — it is the first screen a new
    /// user and a reviewer both open.
    static var isFirstRun: Bool {
        ProcessInfo.processInfo.arguments.contains("-demo-first-run")
    }

    static var scrollsToFeed: Bool {
        ProcessInfo.processInfo.arguments.contains("-demo-scroll-feed")
    }

    /// The date Today's header shows in a screenshot run.
    ///
    /// The fixtures are pinned to fixed dates so a screenshot set is
    /// reproducible months later — and then the header called `Date()` and
    /// undid it, changing the image every day and disagreeing with the
    /// timestamps in the receipts feed below it.
    static var fixedToday: Date? {
        guard isActive else { return nil }
        var components = DateComponents()
        components.year = 2026
        components.month = 9
        components.day = 6
        // Midday, not midnight. The header formatter renders in device-local
        // time, so a midnight-UTC instant shows as the 5th anywhere west of
        // Greenwich — the same mistake weekOf carried before it became a
        // calendar date, reintroduced here in the fixture meant to be stable.
        components.hour = 12
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar.date(from: components)
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
    // Calendar dates, matching the wire format: weekOf is a date, not an
    // instant. It used to be sent as an instant, which made this fixture — and
    // the real app — render the week a day early anywhere west of the server's
    // timezone.
    private static let thisWeek = "2026-08-31"
    private static let lastWeek = "2026-08-24"
    private static let weekBefore = "2026-08-17"

    static func json(for path: String, method: String) -> String {
        switch path {
        case "/api/v1/dashboard" where method == "GET":
            return DemoMode.isFirstRun ? emptyDashboard : dashboard
        case "/api/v1/targets" where method == "GET":
            return DemoMode.isFirstRun ? #"{"target":null}"# : #"{"target":{"calories":2000,"protein":150}}"#
        case "/api/v1/chat" where method == "GET": return chat
        case "/api/v1/checkins" where method == "GET": return checkIns
        default: return #"{"ok":true}"#
        }
    }

    /// A brand-new account: nothing logged, no targets set.
    private static let emptyDashboard = """
    {
      "today": {"meals": [], "target": null, "consumed": {"calories": 0, "protein": 0}},
      "week": {
        "training": {"resistance":0,"hiit":0,"core":0,"stepsToday":0,
          "days":{"resistance":[false,false,false,false,false,false,false],
                  "hiit":[false,false,false,false,false,false,false],
                  "core":[false,false,false,false,false,false,false]}},
        "recovery": {"sleepHours":null,"waterLiters":null,"caffeine":null},
        "streak": [false,false,false,false,false,false,false],
        "weights": [], "mood": null, "measurement": null
      },
      "activity": [],
      "coachMessage": null
    }
    """

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

    /// The numbers are the ones on the approved "Phone — conversation mirror"
    /// artboard in docs/design: 1,085 of 2,000 kcal, 62 of 150g protein, the
    /// 45-minute walk and the baozi. A screenshot and the design canvas
    /// disagreeing about what the product looks like is its own small lie.
    private static let dashboard = """
    {
      "today": {
        "meals": [
          {"id":"m1","foodItems":[{"name":"Grilled salmon salad","portion":"1 bowl","calories":485,"protein":37}],
           "totalCalories":485,"totalProtein":37,"photoUrl":null,
           "loggedAt":"2026-09-06T16:20:00.000Z","source":"manual"},
          {"id":"m2","foodItems":[{"name":"Baozi, beef","portion":"5","calories":600,"protein":25}],
           "totalCalories":600,"totalProtein":25,"photoUrl":null,
           "loggedAt":"2026-09-06T13:17:00.000Z","source":"extracted"}
        ],
        "target": {"calories":2000,"protein":150},
        "consumed": {"calories":1085,"protein":62}
      },
      "week": {
        "training": {"resistance":3,"hiit":1,"core":2,"stepsToday":6540,
          "days":{"resistance":[true,false,true,false,true,false,false],
                  "hiit":[false,true,false,false,false,false,false],
                  "core":[true,false,false,true,false,false,false]}},
        "recovery": {"sleepHours":7.5,"waterLiters":2.5,"caffeine":null},
        "streak": [true,true,false,true,true,true,true],
        "weights": [
          {"at":"2026-08-08T08:00:00.000Z","weightLb":173.4},
          {"at":"2026-08-15T08:00:00.000Z","weightLb":173.0},
          {"at":"2026-08-22T08:00:00.000Z","weightLb":172.6},
          {"at":"2026-08-29T08:00:00.000Z","weightLb":172.8},
          {"at":"2026-09-06T08:00:00.000Z","weightLb":172.0}
        ],
        "mood": {"score":4,"note":"good energy"},
        "measurement": {"weightLb":172.0,"waistIn":null}
      },
      "activity": [
        {"id":"a1","at":"2026-09-06T20:32:00.000Z","sourceText":"went for a 45 minute walk in the park",
         "source":"extracted","kind":"training","label":"NEAT · 45 min walk","photoUrl":null},
        {"id":"a2","at":"2026-09-06T16:20:00.000Z","sourceText":"",
         "source":"manual","kind":"meal","label":"salmon salad · 485 kcal · 37g","photoUrl":null},
        {"id":"a3","at":"2026-09-06T13:17:00.000Z","sourceText":"this morning I had 5 homemade baozi with beef",
         "source":"extracted","kind":"meal","label":"baozi · 600 kcal · 25g","photoUrl":null},
        {"id":"a4","at":"2026-09-06T12:04:00.000Z","sourceText":"slept about 7 and a half hours, feeling good, 172 on the scale",
         "source":"extracted","kind":"recovery","label":"sleep 7.5h · mood 4/5 · 172 lb","photoUrl":null}
      ],
      "coachMessage": "Protein is the lever today — a palm-sized chicken breast at dinner puts you at 105g. How was the walk?"
    }
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
