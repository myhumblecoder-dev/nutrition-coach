import AppIntents
import Foundation

/// "Hey Siri, log food in Roughly."
///
/// Logging by voice is the thing this product is actually for — speaking a
/// meal at the fridge, rather than unlocking a phone and typing into a form.
///
/// Runs in the background (`openAppWhenRun = false`) and lives in the app
/// target rather than an extension, which is not a preference: the session
/// token is in the default Keychain access group keyed on the app's bundle id,
/// and App Attest keys are bound to that same bundle id and verified
/// server-side. An extension would read no token and could mint no assertion
/// the server would accept.
struct LogFoodIntent: AppIntent {
    static var title: LocalizedStringResource = "Log food"
    static var description = IntentDescription(
        "Tell Roughly what you ate and it works out the rest."
    )

    /// No app launch. The whole value is not having to open anything.
    static var openAppWhenRun = false

    @Parameter(
        title: "What you ate",
        requestValueDialog: "What did you eat?"
    )
    var food: String

    /// Injected for tests. `APIClient` is not Sendable, so it is built inside
    /// `perform()` rather than stored — which is also the natural shape, since
    /// the system decodes a fresh intent for every invocation.
    @Dependency private var clientFactory: APIClientFactory

    init() {}

    init(food: String) {
        self.food = food
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        try await Self.log(food, using: clientFactory)
    }

    /// Shared with `LogFoodOneShotIntent`, which differs only in how the words
    /// arrive. Anything that behaves differently between the two should do so
    /// because Siri heard something different, not because the code diverged.
    static func log(
        _ food: String,
        using clientFactory: APIClientFactory
    ) async throws -> some IntentResult & ProvidesDialog {
        let client = clientFactory.make()

        do {
            let spoken = try await client.logSpoken(food)
            return .result(dialog: IntentDialog(stringLiteral: spoken))
        } catch APIError.notSignedIn, APIError.unauthorized {
            return .result(dialog: "Open Roughly and sign in first.")
        } catch APIError.limitReached(let message) {
            // The coach's own words — it explains the cap better than a status
            // code, and it is the same copy the app would show.
            return .result(dialog: IntentDialog(stringLiteral: message))
        } catch APIError.subscriptionRequired(let message) {
            return .result(dialog: IntentDialog(stringLiteral: message))
        } catch is CancellationError {
            return .result(dialog: uncertain)
        } catch let error as URLError where error.code == .timedOut {
            return .result(dialog: uncertain)
        } catch {
            return .result(dialog: "Something went wrong. Try again in a moment.")
        }
    }

    /// Said when the request did not come back in time.
    ///
    /// Not "that failed". A timeout on this side says nothing about what
    /// happened on the other — the log may well have landed a moment later, and
    /// claiming failure would be as wrong as claiming success. Same rule the
    /// coach follows in chat: never assert a state you cannot see.
    private static var uncertain: IntentDialog {
        "I'm not sure that saved — check the app."
    }
}

/// Lets a test hand the intent a stubbed client.
///
/// `@Dependency` rather than a stored property because App Intents are value
/// types the system decodes, and `APIClient` is not Sendable.
struct APIClientFactory {
    let make: @Sendable () -> APIClient

    static let live = APIClientFactory { AppState.liveClient() }
}
