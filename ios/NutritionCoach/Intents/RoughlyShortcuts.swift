import AppIntents

/// The phrases Siri accepts without the user configuring anything.
///
/// Every phrase must contain `${applicationName}` — Siri needs to know which
/// app is being addressed, and a phrase without it is rejected at build time.
///
/// **Order and overlap both matter, and getting them wrong is silent.** Siri
/// matches against these fuzzily and takes the first plausible hit. The first
/// version listed the two-turn shortcut first with the phrase "Log food in
/// Roughly", which swallowed "log a second serving of chocolate cake in
/// Roughly" — the parameterised phrase never got a chance, and the user was
/// asked what they ate having just said it. Likewise "Tell Roughly what I ate"
/// sat almost on top of "Tell Roughly I ate ${food}".
///
/// So: the specific, parameterised phrases come first, and the fallback
/// phrases are worded so they cannot be mistaken for the start of one.
struct RoughlyShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        // First, and deliberately. A phrase carrying the food has to be tried
        // before the one that asks for it.
        AppShortcut(
            intent: LogFoodOneShotIntent(),
            phrases: [
                "Log \(\.$food) in \(.applicationName)",
                "Tell \(.applicationName) I ate \(\.$food)",
                "Add \(\.$food) to \(.applicationName)",
            ],
            shortTitle: "Log food in one go",
            systemImageName: "fork.knife"
        )

        // The fallback, for when someone opens with nothing to log. Worded so
        // it cannot be read as the beginning of a phrase above: no bare "log
        // food", and nothing starting "tell Roughly I".
        AppShortcut(
            intent: LogFoodIntent(),
            phrases: [
                "Log a meal in \(.applicationName)",
                "Start a food log in \(.applicationName)",
                "Open a meal log in \(.applicationName)",
            ],
            shortTitle: "Log a meal",
            systemImageName: "fork.knife"
        )
    }
}
