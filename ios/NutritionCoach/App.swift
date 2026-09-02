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
                    guard state.isSignedIn else { return }
                    await PushRegistrar.shared.registerIfAuthorized(with: state.client)
                }
        }
    }
}
