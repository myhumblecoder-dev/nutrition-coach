import AppIntents

/// The phrases Siri accepts without the user configuring anything.
///
/// Every phrase must contain `${applicationName}` — Siri needs to know which
/// app is being addressed, and a phrase without it is rejected at build time.
///
/// ## Why six shortcuts rather than one parameterised shortcut
///
/// One entry with `"Log a ${kind} in ${app}"` works and is less code, but
/// `systemImageName` is set on the `AppShortcut` rather than on the case — so
/// every kind appeared in Siri and Spotlight with a fork and knife beside it,
/// sleep and weight included. Six entries, each with the kind fixed and its
/// own symbol, is the only way to give them their own faces.
///
/// The intent is the same one either way. Only the presentation differs.
///
/// ## Why there is no one-shot phrase
///
/// "Hey Siri, log a second serving of chocolate cake in Roughly" is what
/// everyone wants to say, and it cannot be built. It was tried properly across
/// three builds on a device.
///
/// App Shortcut phrase parameters must be `AppEnum` or `AppEntity`; a
/// free-form `String` cannot appear in one. The documented way round it is an
/// `AppEntity` backed by an `EntityStringQuery`, which is handed the raw
/// spoken text. The entity part works; the phrase never matches, because Siri
/// pre-generates every variant ahead of time from `suggestedEntities()`, and
/// an entity accepting anything has no suggestions to generate from. Apple's
/// guidance says as much: a "fixed set of well-known parameter values", and
/// explicitly not "open-ended values like 'Search my app for X'".
///
/// That constraint is exactly why the `LogKind` enum below *does* work. A kind
/// is a finite set; a meal is not.
///
/// Do not re-attempt the one-shot without evidence Apple has changed this.
struct RoughlyShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        // Symbols are written out rather than read from `LogKind`, because
        // `systemImageName` demands a compile-time literal.
        //
        // Ordered as `LogKind.allCases`, and `RoughlyShortcutsTests` asserts
        // every case has a shortcut — the compiler will not catch a missing
        // one, and a kind with no phrase is simply invisible.
        AppShortcut(
            intent: LogFoodIntent(kind: .meal),
            phrases: [
                "Log a meal in \(.applicationName)",
                "Log food in \(.applicationName)",
                "Log a snack in \(.applicationName)",
            ],
            shortTitle: "Log a meal",
            systemImageName: "fork.knife"
        )

        AppShortcut(
            intent: LogFoodIntent(kind: .drink),
            phrases: [
                "Log a drink in \(.applicationName)",
                "Log water in \(.applicationName)",
            ],
            shortTitle: "Log a drink",
            systemImageName: "cup.and.saucer"
        )

        AppShortcut(
            intent: LogFoodIntent(kind: .workout),
            phrases: [
                "Log a workout in \(.applicationName)",
                "Log a run in \(.applicationName)",
                "Log training in \(.applicationName)",
            ],
            shortTitle: "Log a workout",
            systemImageName: "figure.run"
        )

        AppShortcut(
            intent: LogFoodIntent(kind: .sleep),
            phrases: [
                "Log my sleep in \(.applicationName)",
                "Log sleep in \(.applicationName)",
            ],
            shortTitle: "Log sleep",
            systemImageName: "bed.double"
        )

        AppShortcut(
            intent: LogFoodIntent(kind: .weight),
            phrases: [
                "Log my weight in \(.applicationName)",
                "Log a weigh-in in \(.applicationName)",
            ],
            shortTitle: "Log weight",
            systemImageName: "scalemass"
        )

        AppShortcut(
            intent: LogFoodIntent(kind: .mood),
            phrases: [
                "Log my mood in \(.applicationName)",
                "Log how I'm feeling in \(.applicationName)",
            ],
            shortTitle: "Log mood",
            systemImageName: "face.smiling"
        )
    }
}
