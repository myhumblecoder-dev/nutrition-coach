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

enum APIError: Error, Equatable {
    case unauthorized
    case badStatus(Int)
    case notSignedIn
}

// MARK: - Weekly check-in

/// One answer: the coach's short summary plus the words the user actually
/// used. Both travel together so the review screen can show the receipt
/// rather than only the app's interpretation.
struct CheckInAnswer: Codable, Equatable {
    let answer: String?
    let said: String?

    var isAnswered: Bool { answer != nil }
}

struct CheckInWeek: Codable, Equatable, Identifiable {
    let weekOf: Date
    let complete: Bool
    let body: CheckInAnswer
    let strength: CheckInAnswer
    let sleep: CheckInAnswer
    let mood: CheckInAnswer

    var id: Date { weekOf }
}

struct CurrentCheckIn: Codable, Equatable {
    let weekOf: Date
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
