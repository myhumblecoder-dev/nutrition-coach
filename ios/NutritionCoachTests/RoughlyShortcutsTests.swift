import XCTest
import AppIntents
@testable import NutritionCoach

final class RoughlyShortcutsTests: XCTestCase {
    func testEveryKindHasAShortcut() {
        // There is one shortcut per kind rather than one parameterised
        // shortcut, because `systemImageName` is set on the AppShortcut and a
        // single entry gave sleep and weight a fork and knife.
        //
        // The cost of that is a list nothing keeps in step: adding a case to
        // `LogKind` compiles perfectly well with no shortcut to invoke it, and
        // the only symptom is a phrase that never works. Hence this.
        XCTAssertEqual(
            RoughlyShortcuts.appShortcuts.count,
            LogKind.allCases.count,
            "a LogKind case has no shortcut, so its phrase will never match"
        )
    }
}
