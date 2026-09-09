import XCTest
import UIKit
@testable import NutritionCoach

/// The thread mixes two sources: messages the server has, and a photo and its
/// pending meal that exist only on this device until the meal is logged.
/// Reloading history must not throw the second kind away.
final class ChatThreadTests: XCTestCase {
    private func message(_ id: String, _ content: String, _ createdAt: Date = Date()) -> ChatMessage {
        ChatMessage(id: id, role: "user", content: content, createdAt: createdAt)
    }

    private let analysis = MealAnalysis(
        mealId: "meal-1",
        photoUrl: "https://blob/x.jpg",
        foodItems: [FoodItem(name: "eggs", portion: "2", calories: 140, protein: 12)],
        totalCalories: 140,
        totalProtein: 12
    )

    private var pendingMeal: PendingMeal {
        PendingMeal(analysis: analysis, image: UIImage(), readAt: at(6))
    }

    func testHistoryReplacesTheMessagesItOwns() {
        let existing: [ChatItem] = [.message(message("old", "stale"))]

        let merged = ChatItem.merged(history: [message("m1", "hello")], keeping: existing)

        XCTAssertEqual(merged.map(\.id), ["m-m1"])
    }

    private func at(_ minute: Int) -> Date {
        Date(timeIntervalSince1970: 1_800_000_000 + Double(minute) * 60)
    }

    func testAnInFlightPhotoAndMealSurviveAReload() {
        // Switching to Today and back re-runs the load. Losing the pending
        // card there would strand a meal the user was in the middle of
        // deciding about, with no way back to it.
        let existing: [ChatItem] = [
            .photo(SentPhoto(image: UIImage(), caption: "burrito", sentAt: at(5))),
            .pending(pendingMeal),
        ]

        let merged = ChatItem.merged(history: [message("m1", "hello", at(1))], keeping: existing)

        XCTAssertEqual(merged.count, 3)
        XCTAssertEqual(merged.map(\.id), ["m-m1", "p-\(photoId(merged))", "pending-meal-1"])
    }

    private func photoId(_ items: [ChatItem]) -> String {
        for case .photo(let photo) in items { return photo.id }
        return ""
    }

    func testAPhotoKeepsItsPlaceWhenTheTalkingCarriesOn() {
        // The reported bug. A photo sent at 8:05 and then chatted past ends up
        // with newer server messages either side of it on reload. Appending
        // the local turns put it under everything said since — the
        // conversation reordered itself the moment you left the tab.
        let existing: [ChatItem] = [
            .photo(SentPhoto(image: UIImage(), caption: "chicken", sentAt: at(5)))
        ]

        let merged = ChatItem.merged(
            history: [
                message("m1", "before the photo", at(1)),
                message("m2", "after the photo", at(9)),
            ],
            keeping: existing
        )

        XCTAssertEqual(merged.map(\.id), ["m-m1", "p-\(photoId(merged))", "m-m2"])
    }

    func testTwoPhotosKeepTheirOrderRelativeToEachOther() {
        let first = SentPhoto(image: UIImage(), caption: "breakfast", sentAt: at(2))
        let second = SentPhoto(image: UIImage(), caption: "lunch", sentAt: at(8))

        let merged = ChatItem.merged(
            history: [message("m1", "midday", at(5))],
            keeping: [.photo(second), .photo(first)]
        )

        XCTAssertEqual(merged.map(\.id), ["p-\(first.id)", "m-m1", "p-\(second.id)"])
    }

    func testAPhotosOutcomeStaysWithIt() {
        // "Logged it ✓" is never persisted server-side, so a reload used to
        // drop it while keeping the photo — leaving a meal in the thread with
        // no sign of what was decided about it.
        let outcome = ChatMessage(
            id: "meal-1", role: "assistant", content: "Logged it ✓", createdAt: at(6)
        )
        let existing: [ChatItem] = [
            .photo(SentPhoto(image: UIImage(), caption: "chicken", sentAt: at(5))),
            .message(outcome),
        ]

        let merged = ChatItem.merged(history: [message("m1", "later", at(9))], keeping: existing)

        XCTAssertEqual(merged.map(\.id).last, "m-m1")
        XCTAssertTrue(merged.contains { $0.id == "m-meal-1" }, "the outcome must survive")
    }

    func testAnOptimisticChatMessageIsDroppedOnceTheServerHasIt() {
        // A "local-" message is a message the server is about to return in
        // history. Keeping it would show it twice.
        let existing: [ChatItem] = [.message(message("local-1", "had eggs"))]

        let merged = ChatItem.merged(history: [message("m1", "hello")], keeping: existing)

        XCTAssertEqual(merged.map(\.id), ["m-m1"])
    }

    func testAnEmptyHistoryStillKeepsWhatIsInFlight() {
        let existing: [ChatItem] = [.pending(pendingMeal)]

        let merged = ChatItem.merged(history: [], keeping: existing)

        XCTAssertEqual(merged.map(\.id), ["pending-meal-1"])
    }
}
