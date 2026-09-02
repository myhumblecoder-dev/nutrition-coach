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
