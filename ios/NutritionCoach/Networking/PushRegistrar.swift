import Foundation
import UIKit
import UserNotifications

/// Bridges APNs registration to the backend.
///
/// The iOS system setting is the gate: this never asks the server to send
/// notifications the OS would suppress. Registering a token IS the opt-in, so
/// revoking permission deletes the row server-side.
@MainActor
final class PushRegistrar {
    static let shared = PushRegistrar()

    private var client: APIClient?
    private var currentToken: String?

    private init() {}

    /// Prompts for permission and registers with APNs if granted.
    func requestAuthorization(with client: APIClient) async -> Bool {
        self.client = client
        let center = UNUserNotificationCenter.current()
        let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        if granted {
            UIApplication.shared.registerForRemoteNotifications()
        }
        return granted
    }

    /// Registers only when permission already exists — used on launch and
    /// after sign-in, so a standing opt-in survives a reinstall without
    /// re-prompting.
    func registerIfAuthorized(with client: APIClient) async {
        self.client = client
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        guard settings.authorizationStatus == .authorized else { return }
        UIApplication.shared.registerForRemoteNotifications()
    }

    func currentAuthorizationStatus() async -> UNAuthorizationStatus {
        await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }

    /// APNs hands back raw bytes; the backend stores the hex string.
    func didRegister(deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        currentToken = hex
        guard let client else { return }
        Task { try? await client.registerDevice(token: hex) }
    }

    func unregister() async {
        guard let client, let token = currentToken else { return }
        try? await client.unregisterDevice(token: token)
        currentToken = nil
    }
}
