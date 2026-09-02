import SwiftUI
import UIKit
import UserNotifications

struct SettingsView: View {
    @Environment(AppState.self) private var state

    @State private var status: UNAuthorizationStatus = .notDetermined

    var body: some View {
        NavigationStack {
            List {
                Section {
                    notificationRow
                } header: {
                    Text("Notifications")
                } footer: {
                    Text("The coach messages you when it's time for your weekly check-in.")
                }

                Section {
                    Button("Sign out", role: .destructive) {
                        Task { await state.signOut() }
                    }
                }
            }
            .navigationTitle("Settings")
        }
        .task { status = await PushRegistrar.shared.currentAuthorizationStatus() }
    }

    @ViewBuilder
    private var notificationRow: some View {
        switch status {
        case .notDetermined:
            Button("Turn on notifications") {
                Task {
                    _ = await PushRegistrar.shared.requestAuthorization(with: state.client)
                    status = await PushRegistrar.shared.currentAuthorizationStatus()
                }
            }
        case .denied:
            // iOS only allows the system prompt once, so the honest action
            // here is to send the user to Settings rather than a dead toggle.
            VStack(alignment: .leading, spacing: 6) {
                Text("Notifications are off").font(.subheadline)
                Button("Open Settings") {
                    guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                    UIApplication.shared.open(url)
                }
            }
        default:
            Label("Notifications are on", systemImage: "checkmark.circle")
                .foregroundStyle(.secondary)
        }
    }
}
