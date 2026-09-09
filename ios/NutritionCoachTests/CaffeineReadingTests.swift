import XCTest
@testable import NutritionCoach

/// The Caffeine row says two things — how much is still in you, and how much
/// longer you will feel it. Both are easy to phrase in a way that reads as a
/// measurement rather than an estimate, so the wording is pinned here.
final class CaffeineReadingTests: XCTestCase {
    private func status(
        total: Double = 200, current: Double, fade: Double, negligible: Double = 10
    ) -> CaffeineStatus {
        CaffeineStatus(
            totalMg: total,
            currentMg: current,
            hoursUntilEffectsFade: fade,
            hoursUntilNegligible: negligible
        )
    }

    func testNothingLoggedIsItsOwnState() {
        // Not "0 mg": nobody logging any coffee and a worn-off coffee are
        // different facts, and the web says "none logged" for exactly this.
        XCTAssertEqual(CaffeineReading(nil), .nothingLogged)
    }

    func testAnActiveDoseReportsMilligramsAndHowLongItLasts() {
        let reading = CaffeineReading(status(current: 180, fade: 3.4))

        XCTAssertEqual(reading, .active(milligrams: 180, summary: "effects ~3.4h", fraction: 0.45))
    }

    func testAWholeNumberOfHoursDropsTheDecimal() {
        // "effects ~3.0h" reads like an instrument reading. It is not one.
        let reading = CaffeineReading(status(current: 200, fade: 3))

        guard case .active(_, let summary, _) = reading else { return XCTFail("expected active") }
        XCTAssertEqual(summary, "effects ~3h")
    }

    func testCaffeineStillPresentButNoLongerFeltSaysSo() {
        // Below the effect threshold the server sends 0 hours. "effects ~0h"
        // would be a strange way to say the coffee stopped working.
        let reading = CaffeineReading(status(current: 30, fade: 0))

        guard case .active(let mg, let summary, _) = reading else { return XCTFail("expected active") }
        XCTAssertEqual(mg, 30)
        XCTAssertEqual(summary, "worn off")
    }

    func testTheBarCannotOverflowOnABigDay() {
        // 400mg is the daily reference the web fills against; a fourth coffee
        // must pin the bar, not run past the end of it.
        let reading = CaffeineReading(status(current: 900, fade: 9))

        guard case .active(_, _, let fraction) = reading else { return XCTFail("expected active") }
        XCTAssertEqual(fraction, 1)
    }

    func testMilligramsAreWholeNumbers() {
        // The server rounds, but the field is a Double and a stray .5 would
        // render as "180.5 mg" against a number nobody measured that finely.
        let reading = CaffeineReading(status(current: 180.6, fade: 1))

        guard case .active(let mg, _, _) = reading else { return XCTFail("expected active") }
        XCTAssertEqual(mg, 181)
    }
}
