import AppIntents

/// Free text, smuggled through a phrase parameter.
///
/// App Shortcut phrases cannot take a `String` — parameters must be `AppEnum`
/// or `AppEntity`, because Siri does not handle dictation of open-ended
/// values. But `EntityStringQuery` is handed the user's raw spoken input so
/// the app can search its own entities with it, and `AppEntity` *is* a legal
/// phrase parameter.
///
/// So: an entity that matches nothing and simply wraps whatever was said. The
/// query does no searching at all; the string is the answer.
///
/// **This is a prototype.** It is here to find out how much of a long spoken
/// phrase Siri actually hands over, which is not documented and not obviously
/// reliable. If it truncates, drops trailing words, or works for two-word
/// foods and fails for real sentences, delete this file and the one-shot
/// phrases with it. The two-turn flow is the thing that ships.
struct SpokenFood: AppEntity {
    let id: String

    /// What was said, verbatim.
    var text: String { id }

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Food"

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(text)")
    }

    static var defaultQuery = SpokenFoodQuery()
}

struct SpokenFoodQuery: EntityStringQuery {
    /// The whole trick. Siri passes what it heard; this wraps it and hands it
    /// straight back rather than matching against anything.
    func entities(matching string: String) async throws -> [SpokenFood] {
        let said = string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !said.isEmpty else { return [] }
        return [SpokenFood(id: said)]
    }

    /// Reached when the system already holds an identifier — a repeated
    /// shortcut, say. The identifier *is* the text, so this is the same answer.
    func entities(for identifiers: [String]) async throws -> [SpokenFood] {
        identifiers.map { SpokenFood(id: $0) }
    }

    /// Nothing to suggest: there is no list of foods, which is the point.
    func suggestedEntities() async throws -> [SpokenFood] { [] }
}
