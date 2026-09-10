#if DEBUG
import Foundation
import UIKit

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

    /// Sends a stand-in meal photo on launch, so the attach-analyse-confirm
    /// path can be looked at without a camera. It drives the real `sendPhoto`,
    /// not a faked card: a fixture that bypassed the code under inspection
    /// would be worth nothing.
    static var sendsAMealPhoto: Bool {
        ProcessInfo.processInfo.arguments.contains("-demo-meal-photo")
    }

    /// Carries the demo past the pending card: corrects the meal in words,
    /// then logs it. Exercises the two paths that only a tap can otherwise
    /// reach.
    static var correctsTheMeal: Bool {
        ProcessInfo.processInfo.arguments.contains("-demo-meal-correct")
    }

    static var logsTheMeal: Bool {
        ProcessInfo.processInfo.arguments.contains("-demo-meal-log")
    }

    /// Reloads history after the meal sequence, standing in for the tab switch
    /// that used to reorder the conversation. Catches what the merge's unit
    /// tests cannot: whether the call sites tag their turns correctly, so
    /// nothing is dropped and nothing arrives twice.
    static var reloadsHistory: Bool {
        ProcessInfo.processInfo.arguments.contains("-demo-reload")
    }

    /// Opens the past-conversations screen on launch, so it can be looked at
    /// without a tap. Inert without the argument.
    /// Serves a 402 from the gated routes, so the paywall — and the path that
    /// raises it — can be inspected without App Store Connect.
    static var isPaywalled: Bool {
        isActive && ProcessInfo.processInfo.arguments.contains("-demo-paywall")
    }

    static var showsChatHistory: Bool {
        ProcessInfo.processInfo.arguments.contains("-demo-chat-history")
    }

    /// Stands in for a camera roll the Simulator does not have. Drawn rather
    /// than bundled so no binary asset ships for a debug-only path.
    static func stubMealPhoto() -> UIImage {
        let size = CGSize(width: 900, height: 675)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor(red: 0.86, green: 0.80, blue: 0.68, alpha: 1).setFill()
            context.fill(CGRect(origin: .zero, size: size))
            UIColor(red: 0.55, green: 0.38, blue: 0.22, alpha: 1).setFill()
            context.cgContext.fillEllipse(in: CGRect(x: 150, y: 120, width: 600, height: 440))
            UIColor(red: 0.29, green: 0.44, blue: 0.24, alpha: 1).setFill()
            context.cgContext.fillEllipse(in: CGRect(x: 300, y: 250, width: 300, height: 190))
        }
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
        let (status, json) = DemoFixtures.response(for: path, method: request.httpMethod ?? "GET")
        let body = Data(json.utf8)
        let response = HTTPURLResponse(
            url: request.url!, statusCode: status, httpVersion: nil,
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

    /// Status alongside the body, because a refusal is a status: a 402 served
    /// as 200 would decode as a coach reply and the paywall would never
    /// appear — which is the exact bug this fixture exists to catch.
    static func response(for path: String, method: String) -> (Int, String) {
        if DemoMode.isPaywalled, method == "POST", isGated(path) {
            return (402, #"{"error":"Honey, the free ride's over. Subscribe and I'll keep reading your plates.","code":"subscription_required"}"#)
        }
        if DemoMode.isPaywalled, path == "/api/v1/subscription" {
            return (200, #"{"tier":"lapsed","expiresAt":"2026-09-01T00:00:00.000Z"}"#)
        }
        return (200, json(for: path, method: method))
    }

    /// The routes that actually cost money to serve, and so the ones the
    /// server answers with 402.
    private static func isGated(_ path: String) -> Bool {
        path == "/api/v1/chat"
            || path == "/api/v1/meals/photo"
            || path.hasSuffix("/revise")
            || path == "/api/v1/checkins"
    }

    static func json(for path: String, method: String) -> String {
        switch path {
        case "/api/v1/dashboard" where method == "GET":
            return DemoMode.isFirstRun ? emptyDashboard : dashboard
        case "/api/v1/targets" where method == "GET":
            return DemoMode.isFirstRun ? #"{"target":null}"# : #"{"target":{"calories":2000,"protein":150}}"#
        // -demo-first-run stands in for a fresh morning: today has nothing in
        // it yet, which is the state the empty copy exists for.
        case "/api/v1/chat" where method == "GET":
            return DemoMode.isFirstRun ? #"{"messages":[]}"# : chat
        case "/api/v1/checkins" where method == "GET": return checkIns
        case "/api/v1/timezone": return #"{"timezone":"America/New_York"}"#
        case "/api/v1/chat/days": return chatDays
        case "/api/v1/meals/photo" where method == "POST": return mealAnalysis
        // A correction re-reads the same photo, so it answers in the same
        // shape — with different numbers, which is the point of it.
        case let p where p.hasSuffix("/revise") && method == "POST": return revisedMeal
        // Confirm and discard fall through to {"ok":true}, which is exactly
        // what the real routes return.
        default: return #"{"ok":true}"#
        }
    }

    /// What the coach reads off a meal photo. Lets a screenshot run — and a
    /// developer checking a layout — exercise the real analyze-and-confirm
    /// path in the Simulator, which has no camera and no backend.
    private static let mealAnalysis = """
    {"mealId":"demo-meal-1","photoUrl":"https://example.invalid/meal.jpg",
     "foodItems":[
       {"name":"grilled chicken","portion":"about 6 oz","calories":280,"protein":52},
       {"name":"black beans","portion":"1 cup","calories":227,"protein":15},
       {"name":"pico de gallo","portion":"2 tbsp","calories":11,"protein":1}],
     "totalCalories":518,"totalProtein":68}
    """

    /// The same meal after being told the portion was bigger.
    private static let revisedMeal = """
    {"mealId":"demo-meal-1","photoUrl":"https://example.invalid/meal.jpg",
     "foodItems":[
       {"name":"grilled chicken","portion":"about 10 oz","calories":465,"protein":87},
       {"name":"black beans","portion":"1.5 cups","calories":341,"protein":23},
       {"name":"pico de gallo","portion":"2 tbsp","calories":11,"protein":1}],
     "totalCalories":817,"totalProtein":111}
    """

    /// Past days for the history screen.
    private static let chatDays = """
    {"days":[{"date":"2026-09-05","messageCount":8},
             {"date":"2026-09-04","messageCount":12},
             {"date":"2026-09-03","messageCount":4}]}
    """

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
      "coachMessage": "Right, let\'s get you started. What are you aiming for in a day — calories and protein? If you have no idea, just tell me roughly how tall you are and what you weigh, and I\'ll work out somewhere to start."
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
        "recovery": {"sleepHours":7.5,"waterLiters":2.5,
          "caffeine":{"totalMg":260,"currentMg":180,
            "hoursUntilEffectsFade":3.4,"hoursUntilNegligible":8.4}},
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
