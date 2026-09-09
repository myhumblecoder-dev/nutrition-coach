import XCTest
import UserNotifications
@testable import NutritionCoach

/// The timing is the whole point, so it is the part that gets tested. The
/// scheduling itself is three lines against a system object that cannot be
/// stood up in a unit test.
final class MealRemindersTests: XCTestCase {
    private func triggers(_ zone: String) -> [UNCalendarNotificationTrigger] {
        MealReminders.requests(timeZoneIdentifier: zone)
            .compactMap { $0.trigger as? UNCalendarNotificationTrigger }
    }

    func testThreeReminders() {
        XCTAssertEqual(MealReminders.requests(timeZoneIdentifier: "America/New_York").count, 3)
    }

    func testTheyFireAtNineOneAndSeven() {
        let hours = triggers("America/New_York").map { $0.dateComponents.hour }

        XCTAssertEqual(hours, [9, 13, 19])
    }

    func testTheyRepeatDaily() {
        // Without this each one fires once and never again, which would look
        // like notifications quietly breaking after day one.
        XCTAssertTrue(triggers("America/New_York").allSatisfy(\.repeats))
        // Only hour and minute: a day component would pin them to one date.
        XCTAssertTrue(triggers("America/New_York").allSatisfy { $0.dateComponents.day == nil })
    }

    func testTheyArePinnedToTheChosenZoneNotTheDevice() {
        // The user picks a timezone in Settings, which may not be the phone's.
        // Someone who set London on a phone in New York must get prompts at
        // London's nine, with nothing on screen able to explain otherwise.
        let zones = triggers("Europe/London").map { $0.dateComponents.timeZone?.identifier }

        XCTAssertEqual(zones, ["Europe/London", "Europe/London", "Europe/London"])
    }

    func testAnUnknownZoneFallsBackRatherThanCrashing() {
        // The identifier comes from the server, which took it from a client.
        let zones = triggers("Mars/Olympus_Mons").map { $0.dateComponents.timeZone }

        XCTAssertEqual(zones.count, 3)
        XCTAssertTrue(zones.allSatisfy { $0 != nil })
    }

    func testIdentifiersAreStableSoReschedulingReplaces() {
        // Rescheduling with the same ids overwrites. New ids each time would
        // stack duplicates until the 64-notification limit silently ate them.
        let first = MealReminders.requests(timeZoneIdentifier: "America/New_York").map(\.identifier)
        let again = MealReminders.requests(timeZoneIdentifier: "Europe/London").map(\.identifier)

        XCTAssertEqual(first, again)
        XCTAssertEqual(Set(first).count, 3, "the three must not share an identifier")
    }

    func testEachOneSaysSomethingDifferent() {
        // Three identical nudges a day is nagging, not coaching.
        // `content` hands back an immutable copy, so read it as such.
        let bodies = MealReminders.requests(timeZoneIdentifier: "America/New_York")
            .map(\.content.body)

        XCTAssertEqual(Set(bodies).count, 3)
        XCTAssertTrue(bodies.allSatisfy { !$0.isEmpty })
    }
}
