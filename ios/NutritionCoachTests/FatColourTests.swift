import XCTest
import SwiftUI
@testable import NutritionCoach

final class FatColourTests: XCTestCase {
    private func rgb(_ color: Color) -> (Double, Double, Double) {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a)
        return (Double(r), Double(g), Double(b))
    }

    func testAllWholeFoodFatIsTheGreenEnd() {
        XCTAssertEqual(rgb(FatColour.forShare(1)).0, rgb(Theme.fatWhole).0, accuracy: 0.01)
        XCTAssertEqual(rgb(FatColour.forShare(1)).1, rgb(Theme.fatWhole).1, accuracy: 0.01)
    }

    func testAllRefinedFatIsTheAmberEnd() {
        XCTAssertEqual(rgb(FatColour.forShare(0)).0, rgb(Theme.fatRefined).0, accuracy: 0.01)
        XCTAssertEqual(rgb(FatColour.forShare(0)).1, rgb(Theme.fatRefined).1, accuracy: 0.01)
    }

    func testItWalksBetweenTheEndsRatherThanSwitching() {
        // A gradient, not a traffic light. A day slightly worse should look
        // slightly worse, not flip at an invented threshold — and a threshold
        // would be a verdict, which voice.ts forbids aiming at a person.
        let greens = [0.0, 0.25, 0.5, 0.75, 1.0].map { rgb(FatColour.forShare($0)).1 }

        XCTAssertEqual(greens, greens.sorted(), "green should rise with the whole-food share")
        XCTAssertEqual(Set(greens).count, 5, "each step should be its own colour")
    }

    func testNoFatIsTheEmptyTrackColour() {
        // Nil is "nothing to say", not "the worst". A day of dry toast must not
        // render the same as a day of crisps.
        XCTAssertEqual(rgb(FatColour.forShare(nil)).0, rgb(Theme.track).0, accuracy: 0.01)
    }

    func testItClampsRatherThanExtrapolating() {
        XCTAssertEqual(rgb(FatColour.forShare(1.4)).1, rgb(Theme.fatWhole).1, accuracy: 0.01)
        XCTAssertEqual(rgb(FatColour.forShare(-0.3)).1, rgb(Theme.fatRefined).1, accuracy: 0.01)
    }
}
