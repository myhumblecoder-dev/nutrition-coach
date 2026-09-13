import AppIntents

/// What someone is about to log.
///
/// This is the shape App Shortcuts actually supports, and the reason it works
/// where free text did not: Siri pre-generates a phrase variant for every case
/// ahead of time, which it can only do for a finite set. "What kind of thing
/// am I logging" is finite; "what did I eat" is not.
///
/// Every case maps onto something `extractHealthFacts` already records —
/// meals, training, recovery, mood and measurement — so nothing new is stored.
/// The kind's job is to pick the right follow-up question and to phrase what
/// gets sent so the model is not left guessing what "seven hours" was.
enum LogKind: String, AppEnum, CaseIterable {
    case meal
    case drink
    case workout
    case sleep
    case weight
    case mood

    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Kind of entry")

    /// Synonyms matter more than they look. Each of these becomes a phrase
    /// Siri will match, so "log a run in Roughly" reaching `workout` is the
    /// difference between the feature being usable and being a memory test.
    static var caseDisplayRepresentations: [LogKind: DisplayRepresentation] = [
        .meal: DisplayRepresentation(
            title: "meal",
            synonyms: ["food", "snack", "breakfast", "lunch", "dinner"]
        ),
        .drink: DisplayRepresentation(
            title: "drink",
            synonyms: ["water", "coffee", "beer"]
        ),
        .workout: DisplayRepresentation(
            title: "workout",
            synonyms: ["session", "training", "run", "lift", "exercise"]
        ),
        .sleep: DisplayRepresentation(title: "sleep", synonyms: ["night", "nap"]),
        .weight: DisplayRepresentation(title: "weight", synonyms: ["weigh-in"]),
        .mood: DisplayRepresentation(title: "mood", synonyms: ["feeling"]),
    ]

    /// What Siri asks next. A single generic prompt would be worse than no
    /// kinds at all — being asked "what did you eat?" after saying "log my
    /// sleep" is the app not listening.
    var question: IntentDialog {
        switch self {
        case .meal: "What did you eat?"
        case .drink: "What did you drink?"
        case .workout: "What did you do?"
        case .sleep: "How long did you sleep?"
        case .weight: "What do you weigh?"
        case .mood: "How are you feeling?"
        }
    }

    /// Turns an answer into a sentence the extractor cannot misread.
    ///
    /// "Seven hours" on its own is not obviously sleep, and "one eighty" is not
    /// obviously a weight. The kind is already known here, so saying so costs
    /// nothing — and the composed sentence is what gets stored as the receipt,
    /// so it has to read like something a person would write.
    func phrase(_ detail: String) -> String {
        let said = detail.trimmingCharacters(in: .whitespacesAndNewlines)

        switch self {
        case .meal: return "I had \(said)"
        case .drink: return "I drank \(said)"
        case .workout: return "I did \(said)"
        case .sleep: return "I slept \(said)"
        case .weight: return "I weigh \(said)"
        case .mood: return "I'm feeling \(said)"
        }
    }
}
