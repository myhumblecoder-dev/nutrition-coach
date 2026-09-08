import Foundation

// Mirrors the JSON shapes returned by /api/v1. The server deliberately sends
// structured fields rather than pre-formatted strings, so these decode
// directly with no post-processing.

struct FoodItem: Codable, Equatable {
    let name: String
    let portion: String
    let calories: Int
    let protein: Int
}

struct Meal: Codable, Equatable, Identifiable {
    let id: String
    let foodItems: [FoodItem]
    let totalCalories: Int
    let totalProtein: Int
    /// Null for meals logged through conversation rather than a photo.
    let photoUrl: String?
    let loggedAt: Date
    let source: String
}

/// What the vision model read from a photo, before the user has agreed to it.
///
/// The meal already exists server-side at this point, but pending: it is
/// excluded from every total until `confirmMeal`, and `discardMeal` removes
/// it. So abandoning this screen is safe — the worst case is a stale row that
/// never counted.
struct MealAnalysis: Codable, Equatable, Identifiable {
    /// The pending meal's own id, so `.sheet(item:)` presents exactly one
    /// analysis and re-presents when a second photo replaces it.
    var id: String { mealId }

    let mealId: String
    let photoUrl: String
    let foodItems: [FoodItem]
    let totalCalories: Int
    let totalProtein: Int
}

struct MacroPair: Codable, Equatable {
    let calories: Int
    let protein: Int
}

struct TodayResponse: Codable, Equatable {
    let meals: [Meal]
    let target: MacroPair?
    let consumed: MacroPair
}

struct ChatMessage: Codable, Equatable, Identifiable {
    let id: String
    let role: String
    let content: String
    let createdAt: Date

    var isFromCoach: Bool { role == "assistant" }
}

struct ChatHistoryResponse: Codable, Equatable {
    let messages: [ChatMessage]
}

struct ChatReplyResponse: Codable, Equatable {
    let assistantReply: String
}

struct AuthUser: Codable, Equatable {
    let id: String
    let email: String?
    let name: String?
}

struct AuthResponse: Codable, Equatable {
    let token: String
    let expires: Date
    let user: AuthUser
}

/// A short-lived, server-signed nonce. Opaque to the client: it is hashed
/// into the attestation and never inspected here.
struct AttestChallengeResponse: Codable, Equatable {
    let challenge: String
}

enum APIError: Error, Equatable {
    case unauthorized
    case badStatus(Int)
    case notSignedIn
    /// The server refused because a daily cap is spent, and sent copy written
    /// to be read by the user. Carried rather than flattened to a status code
    /// because "that's plenty of photos for today" and "that photo didn't
    /// work" ask for completely different things from the person reading it.
    case limitReached(String)
}

struct TargetResponse: Codable, Equatable {
    /// Null until the user sets one. Distinct from a zero target: Today shows
    /// no rings at all rather than rings reading 0.
    let target: MacroPair?
}

// MARK: - Dashboard

/// Everything the Today screen renders, from a single request.
///
/// The web assembles the same four pieces in a server component, where the
/// round trips are free. On a phone they are not, and a dashboard arriving in
/// four parts shows four loading states.
struct DashboardResponse: Codable, Equatable {
    let today: TodayResponse
    let week: WeekResponse
    let activity: [ActivityItem]
    /// The coach's most recent line. Null before the coach has ever spoken,
    /// in which case the strip is not shown at all.
    let coachMessage: String?
}

struct TrainingWeek: Codable, Equatable {
    let resistance: Int
    let hiit: Int
    let core: Int
    let stepsToday: Int
    let days: TrainingDays
}

/// Seven booleans per discipline, Monday-first, matching the M T W T F S S
/// dot grid on the web.
struct TrainingDays: Codable, Equatable {
    let resistance: [Bool]
    let hiit: [Bool]
    let core: [Bool]
}

struct CaffeineStatus: Codable, Equatable {
    let totalMg: Double
    let currentMg: Double
    let hoursUntilEffectsFade: Double
    let hoursUntilNegligible: Double
}

struct RecoveryToday: Codable, Equatable {
    let sleepHours: Double?
    let waterLiters: Double?
    let caffeine: CaffeineStatus?
}

struct MoodToday: Codable, Equatable {
    let score: Int
    let note: String?
}

struct MeasurementLatest: Codable, Equatable {
    let weightLb: Double?
    let waistIn: Double?
}

struct WeightPoint: Codable, Equatable, Identifiable {
    let at: Date
    let weightLb: Double

    var id: Date { at }
}

struct WeekResponse: Codable, Equatable {
    let training: TrainingWeek
    let recovery: RecoveryToday
    /// Seven days ending today: the logging streak dots.
    let streak: [Bool]
    let weights: [WeightPoint]
    let mood: MoodToday?
    let measurement: MeasurementLatest?
}

/// One receipt: what the user said, and what the coach logged from it.
///
/// `sourceText` is the evidence for the product's central claim — that every
/// number on the dashboard traces back to something you told the coach. It is
/// empty for a row the user created directly rather than through conversation.
struct ActivityItem: Codable, Equatable, Identifiable {
    let id: String
    let at: Date
    let sourceText: String
    let source: String
    let kind: String
    let label: String
    let photoUrl: String?

    /// The web shows a "via chat" badge for these.
    var isFromConversation: Bool { source == "extracted" }
}

// MARK: - Weekly check-in

/// A calendar date with no time and no timezone — "the week of 24 August",
/// not an instant.
///
/// `weekOf` is a wall-clock date the server computes in its own timezone. It
/// used to arrive as an ISO instant and get rendered by a `DateFormatter` with
/// no `timeZone` set, which meant every device west of the server's timezone
/// labelled the week a day early: "Week of August 23" for a week that began on
/// the 24th.
///
/// Decoding it into a type that cannot express a time of day is what stops
/// that returning. There is no `Date` here to be re-interpreted, and no
/// formatter a future caller could forget to pin.
struct CalendarDate: Codable, Equatable, Hashable, Comparable, Sendable {
    let year: Int
    let month: Int
    let day: Int

    init(year: Int, month: Int, day: Int) {
        self.year = year
        self.month = month
        self.day = day
    }

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        let parts = raw.split(separator: "-")
        guard parts.count == 3,
              let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]),
              (1...12).contains(month), (1...31).contains(day)
        else {
            throw DecodingError.dataCorruptedError(
                in: try decoder.singleValueContainer(),
                debugDescription: "Expected a YYYY-MM-DD calendar date, got: \(raw)"
            )
        }
        self.init(year: year, month: month, day: day)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(description)
    }

    /// The wire format, and a representation that sorts correctly as a string.
    var description: String {
        String(format: "%04d-%02d-%02d", year, month, day)
    }

    static func < (lhs: CalendarDate, rhs: CalendarDate) -> Bool {
        (lhs.year, lhs.month, lhs.day) < (rhs.year, rhs.month, rhs.day)
    }

    // A fixed UTC calendar and formatter, used only to turn the components
    // into a localised month name. Both are pinned to UTC so the round trip
    // cannot move the day — the whole point of the type.
    private static let utc = TimeZone(secondsFromGMT: 0)!

    private static let monthDayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM d"
        formatter.timeZone = utc
        return formatter
    }()

    /// "August 24" — the same string on every device, in every timezone.
    var monthAndDay: String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = Self.utc
        guard let date = calendar.date(from: DateComponents(year: year, month: month, day: day))
        else { return description }
        return Self.monthDayFormatter.string(from: date)
    }
}

/// One answer: the coach's short summary plus the words the user actually
/// used. Both travel together so the review screen can show the receipt
/// rather than only the app's interpretation.
struct CheckInAnswer: Codable, Equatable {
    let answer: String?
    let said: String?

    var isAnswered: Bool { answer != nil }
}

struct CheckInWeek: Codable, Equatable, Identifiable {
    let weekOf: CalendarDate
    let complete: Bool
    let body: CheckInAnswer
    let strength: CheckInAnswer
    let sleep: CheckInAnswer
    let mood: CheckInAnswer

    var id: CalendarDate { weekOf }
}

struct CurrentCheckIn: Codable, Equatable {
    let weekOf: CalendarDate
    let complete: Bool
    let nextField: String?
    let nextQuestion: String?
}

struct CheckInsResponse: Codable, Equatable {
    let current: CurrentCheckIn
    let history: [CheckInWeek]
}

struct RecordedAnswer: Codable, Equatable {
    let field: String
    let answer: String?
}

struct CheckInReplyResponse: Codable, Equatable {
    let complete: Bool
    let recorded: RecordedAnswer?
    let reply: String?
    let nextQuestion: String?
}
