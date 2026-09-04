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
