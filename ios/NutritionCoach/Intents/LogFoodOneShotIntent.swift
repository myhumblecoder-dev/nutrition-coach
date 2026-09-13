import AppIntents
import Foundation

/// "Hey Siri, log chicken and rice in Roughly" — in one breath.
///
/// Same work as `LogFoodIntent`, differing only in that the food arrives as a
/// `SpokenFood` entity rather than being asked for in a second turn. See
/// `SpokenFood` for why that indirection exists.
///
/// **Prototype.** Ships only if Siri reliably hands over a whole spoken
/// phrase. Until that is established on a device, the two-turn intent is the
/// one that matters.
struct LogFoodOneShotIntent: AppIntent {
    static var title: LocalizedStringResource = "Log food in one go"
    static var description = IntentDescription(
        "Tell Roughly what you ate without being asked twice."
    )

    static var openAppWhenRun = false

    @Parameter(title: "What you ate")
    var food: SpokenFood

    @Dependency private var clientFactory: APIClientFactory

    init() {}

    init(food: SpokenFood) {
        self.food = food
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        // Deliberately the same path as the two-turn intent. If this one ever
        // behaves differently it should be because Siri handed over different
        // words, not because it took a different route to the server.
        try await LogFoodIntent.log(food.text, using: clientFactory)
    }
}
