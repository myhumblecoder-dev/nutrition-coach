import XCTest
import UIKit
@testable import NutritionCoach

/// The thread mixes two sources: messages the server has, and a photo and its
/// pending meal that exist only on this device until the meal is logged.
/// Reloading history must not throw the second kind away.
final class ChatThreadTests: XCTestCase {
    private func message(_ id: String, _ content: String) -> ChatMessage {
        ChatMessage(id: id, role: "user", content: content, createdAt: Date())
    }

    private let analysis = MealAnalysis(
        mealId: "meal-1",
        photoUrl: "https://blob/x.jpg",
        foodItems: [FoodItem(name: "eggs", portion: "2", calories: 140, protein: 12)],
        totalCalories: 140,
        totalProtein: 12
    )

    private var pendingMeal: PendingMeal {
        PendingMeal(analysis: analysis, image: UIImage())
    }

    func testHistoryReplacesTheMessagesItOwns() {
        let existing: [ChatItem] = [.message(message("old", "stale"))]

        let merged = ChatItem.merged(history: [message("m1", "hello")], keeping: existing)

        XCTAssertEqual(merged.map(\.id), ["m-m1"])
    }

    func testAnInFlightPhotoAndMealSurviveAReload() {
        // Switching to Today and back re-runs the load. Losing the pending
        // card there would strand a meal the user was in the middle of
        // deciding about, with no way back to it.
        let existing: [ChatItem] = [
            .photo(SentPhoto(image: UIImage(), caption: "burrito")),
            .pending(pendingMeal),
        ]

        let merged = ChatItem.merged(history: [message("m1", "hello")], keeping: existing)

        XCTAssertEqual(merged.count, 3)
        XCTAssertEqual(merged.first?.id, "m-m1", "server history comes first")
        // The local turns are the most recent thing that happened, so they
        // belong at the end.
        XCTAssertEqual(merged.last?.id, "pending-meal-1")
    }

    func testASettledMealIsNotResurrected() {
        // Once logged or discarded the card is gone and the coach's reply is
        // an ordinary message. Only genuinely local turns are carried over.
        let existing: [ChatItem] = [.message(message("local-1", "Logged it ✓"))]

        let merged = ChatItem.merged(history: [message("m1", "hello")], keeping: existing)

        XCTAssertEqual(merged.map(\.id), ["m-m1"])
    }

    func testAnEmptyHistoryStillKeepsWhatIsInFlight() {
        let existing: [ChatItem] = [.pending(pendingMeal)]

        let merged = ChatItem.merged(history: [], keeping: existing)

        XCTAssertEqual(merged.map(\.id), ["pending-meal-1"])
    }
}
