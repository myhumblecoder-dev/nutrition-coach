import SwiftUI
import UIKit

/// Receives the APNs device token. SwiftUI has no native hook for this, so a
/// minimal UIKit delegate is still required.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { @MainActor in PushRegistrar.shared.didRegister(deviceToken: deviceToken) }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        // Non-fatal: the app still works, it just cannot be pinged. Common on
        // a simulator with no push capability.
        print("APNs registration failed: \(error.localizedDescription)")
    }
}

@main
struct NutritionCoachApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var state = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(state)
                .task {
                    // Before everything, including attestation: StoreKit
                    // delivers transactions it finished while the app was
                    // closed — a renewal, a purchase made on another device —
                    // and only to a listener that is already running.
                    state.startObservingTransactions()
                    // Before the sign-in check: the sign-in endpoint is itself
                    // attested, so an unregistered device could never get past
                    // it if this waited for a session.
                    await state.prepareAttestation()
                    guard state.isSignedIn else { return }
                    // Rescheduled every launch against the zone the server
                    // holds, so a timezone changed on another device is picked
                    // up here. Same identifiers, so it replaces rather than
                    // stacks.
                    await state.scheduleMealReminders()
                    await state.refreshEntitlement()
                    await PushRegistrar.shared.registerIfAuthorized(with: state.client)
                }
        }
    }
}
