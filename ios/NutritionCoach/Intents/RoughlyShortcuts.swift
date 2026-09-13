import AppIntents

/// The phrases Siri accepts without the user configuring anything.
///
/// Every phrase must contain `${applicationName}` — Siri needs to know which
/// app is being addressed, and a phrase without it is rejected at build time.
///
/// ## Why there is no one-shot phrase
///
/// "Hey Siri, log a second serving of chocolate cake in Roughly" is the thing
/// everyone wants to say, and it cannot be built. This was tried properly.
///
/// App Shortcut phrase parameters must be `AppEnum` or `AppEntity`; a
/// free-form `String` cannot appear in one. The documented way round that is
/// an `AppEntity` backed by an `EntityStringQuery`, which is handed the raw
/// spoken text — so an entity that matches nothing and wraps whatever was said
/// ought to smuggle free text through. It was implemented and tested on a
/// device across three builds.
///
/// It does not work, and the reason is structural. Siri **pre-generates** every
/// phrase variant ahead of time from `suggestedEntities()`. An entity that
/// accepts anything has no suggestions to offer, so there are no variants to
/// index, so the parameterised phrase never matches. Apple's own guidance says
/// as much: App Shortcuts support "a fixed set of well-known parameter values"
/// and explicitly not "open-ended values like 'Search my app for X'".
///
/// What actually happened on the device is Apple's documented fallback: Siri
/// asked what the user had eaten and resolved the answer through the string
/// query. Which is the two-turn flow, arrived at from the other direction.
///
/// So this is the two-turn flow, deliberately. Do not re-attempt the one-shot
/// without new evidence that Apple has changed the constraint.
struct RoughlyShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: LogFoodIntent(),
            phrases: [
                "Log food in \(.applicationName)",
                "Log a meal in \(.applicationName)",
                "Tell \(.applicationName) what I ate",
                "Start a food log in \(.applicationName)",
            ],
            shortTitle: "Log food",
            systemImageName: "fork.knife"
        )
    }
}
