import XCTest
import AppIntents
@testable import NutritionCoach

/// The kind exists to make Siri ask the right question and to say enough that
/// the extractor cannot misread the answer. Both are testable; only the speech
/// recognition is not.
final class LogKindTests: XCTestCase {
    func testEachKindAsksItsOwnQuestion() {
        // A single generic prompt would be worse than no kinds at all — being
        // asked "what did you eat?" after saying "log my sleep" is the app not
        // listening.
        let questions = LogKind.allCases.map { "\($0.question)" }

        XCTAssertEqual(Set(questions).count, LogKind.allCases.count, "questions repeat: \(questions)")
    }

    func testAnAnswerBecomesASentenceTheExtractorCanRead() {
        // "Seven hours" is not obviously sleep and "one eighty" is not
        // obviously a weight. The kind is known here, so saying so is free.
        XCTAssertEqual(LogKind.sleep.phrase("seven hours"), "I slept seven hours")
        XCTAssertEqual(LogKind.weight.phrase("180 pounds"), "I weigh 180 pounds")
        XCTAssertEqual(LogKind.workout.phrase("45 minutes of squats"), "I did 45 minutes of squats")
        XCTAssertEqual(LogKind.meal.phrase("two eggs"), "I had two eggs")
        XCTAssertEqual(LogKind.drink.phrase("a litre of water"), "I drank a litre of water")
    }

    func testItTrimsWhatSiriHandedOver() {
        XCTAssertEqual(LogKind.meal.phrase("  two eggs  "), "I had two eggs")
    }

    func testTheSentenceReadsLikeSomethingAPersonWrote() {
        // It is stored as the receipt and shown in the activity feed, so it
        // has to survive being read back.
        for kind in LogKind.allCases {
            let sentence = kind.phrase("something")
            XCTAssertTrue(sentence.hasPrefix("I"), "\(kind) produced \(sentence)")
            XCTAssertFalse(sentence.contains("  "), "\(kind) produced double spaces")
        }
    }

    func testEveryKindOffersSynonyms() {
        // Each synonym becomes a phrase Siri will match. Without them the
        // feature is a memory test — "log a run" has to reach `workout`.
        for kind in LogKind.allCases {
            let representation = LogKind.caseDisplayRepresentations[kind]
            XCTAssertNotNil(representation, "\(kind) has no display representation")
        }
    }

    func testTheKindsCoverWhatTheServerCanActuallyRecord() {
        // meals, training, recovery, mood and measurement — the five families
        // `extractHealthFacts` writes. A kind with nowhere to land would ask a
        // question and then quietly log nothing.
        XCTAssertEqual(
            Set(LogKind.allCases),
            [.meal, .drink, .workout, .sleep, .weight, .mood]
        )
    }
}
