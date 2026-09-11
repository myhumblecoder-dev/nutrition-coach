import XCTest
@testable import NutritionCoach

final class SubscriptionPeriodTextTests: XCTestCase {
    func testADurationAlwaysSaysItsNumber() {
        // The bug this exists for: "week free" instead of "1 week free", which
        // shipped to a screenshot because one formatter served both jobs.
        XCTAssertEqual(SubscriptionPeriodText.duration(value: 1, unit: .week), "1 week")
        XCTAssertEqual(SubscriptionPeriodText.duration(value: 1, unit: .month), "1 month")
    }

    func testADurationPluralisesAboveOne() {
        XCTAssertEqual(SubscriptionPeriodText.duration(value: 3, unit: .day), "3 days")
        XCTAssertEqual(SubscriptionPeriodText.duration(value: 2, unit: .week), "2 weeks")
    }

    func testARecurrenceDropsALoneOne() {
        // Follows "per", where the 1 is implied: "$7.99 per month".
        XCTAssertEqual(SubscriptionPeriodText.recurrence(value: 1, unit: .month), "month")
        XCTAssertEqual(SubscriptionPeriodText.recurrence(value: 1, unit: .year), "year")
    }

    func testARecurrenceKeepsANumberAboveOne() {
        XCTAssertEqual(SubscriptionPeriodText.recurrence(value: 3, unit: .month), "3 months")
    }

    func testAnUnrecognisedUnitStillReads() {
        XCTAssertEqual(SubscriptionPeriodText.duration(value: 2, unit: .unknown), "2 periods")
    }
}
