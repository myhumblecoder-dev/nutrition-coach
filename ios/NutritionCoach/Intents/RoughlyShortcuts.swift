import AppIntents

/// The phrases Siri accepts without the user configuring anything.
///
/// Every phrase must contain `${applicationName}` — Siri needs to know which
/// app is being addressed, and a phrase without it is rejected at build time.
///
/// Deliberately a fixed phrase with the food asked for separately. App Shortcut
/// phrase parameters must be `AppEnum` or `AppEntity`; a free-form `String`
/// cannot appear in one, because Siri does not handle dictation of open-ended
/// values. "Log I just ate a second serving of chocolate cake" therefore cannot
/// work as a single utterance, however much it reads like the natural thing to
/// say.
struct RoughlyShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: LogFoodIntent(),
            phrases: [
                "Log food in \(.applicationName)",
                "Log a meal in \(.applicationName)",
                "Tell \(.applicationName) what I ate",
            ],
            shortTitle: "Log food",
            systemImageName: "fork.knife"
        )

        // Prototype. `${food}` is an entity rather than a String because a
        // phrase cannot take free text — see `SpokenFood`. Whether Siri hands
        // over a whole spoken sentence or only the first word or two is the
        // open question, and it can only be answered on a device.
        //
        // If it proves unreliable, delete this shortcut, both files it names,
        // and keep the two-turn flow above.
        AppShortcut(
            intent: LogFoodOneShotIntent(),
            phrases: [
                "Log \(\.$food) in \(.applicationName)",
                "Tell \(.applicationName) I ate \(\.$food)",
            ],
            shortTitle: "Log food in one go",
            systemImageName: "fork.knife"
        )
    }
}
