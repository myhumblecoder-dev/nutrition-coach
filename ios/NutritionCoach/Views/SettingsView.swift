import SwiftUI
import UIKit
import UserNotifications

struct SettingsView: View {
    @Environment(AppState.self) private var state

    @State private var status: UNAuthorizationStatus = .notDetermined
    @State private var confirmingDelete = false
    @State private var deleting = false
    @State private var deleteError: String?

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
                    Link("Privacy policy", destination: AppState.privacyPolicyURL)
                    Link("Support", destination: AppState.supportURL)
                }

                Section {
                    Button("Sign out", role: .destructive) {
                        Task { await state.signOut() }
                    }
                }

                // App Store Review Guideline 5.1.1(v): an account that can be
                // created in the app must be deletable in the app. Its own
                // section, below sign out, so the two are not adjacent taps.
                Section {
                    Button("Delete account", role: .destructive) {
                        confirmingDelete = true
                    }
                    .disabled(deleting)
                } footer: {
                    if let deleteError {
                        Text(deleteError).foregroundStyle(.red)
                    } else {
                        Text(
                            """
                            Permanently deletes your account and everything in it — \
                            meals, chat history, check-ins and measurements. This cannot \
                            be undone.
                            """
                        )
                    }
                }
            }
            .navigationTitle("Settings")
            .alert("Delete your account?", isPresented: $confirmingDelete) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    Task {
                        deleting = true
                        deleteError = await state.deleteAccount()
                        deleting = false
                    }
                }
            } message: {
                Text("Everything is erased and cannot be recovered.")
            }
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
