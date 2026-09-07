import SwiftUI
import UIKit
import UserNotifications

struct SettingsView: View {
    @Environment(AppState.self) private var state

    @State private var status: UNAuthorizationStatus = .notDetermined
    @State private var calories = ""
    @State private var protein = ""
    @State private var savingTargets = false
    @State private var targetsMessage: String?
    @FocusState private var targetFieldFocused: Bool
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

                // The rings on Today have no denominator until these are
                // set, so a new account sees no graphs at all. The coach can
                // set them in conversation too — this is the direct route.
                Section {
                    HStack {
                        Text("Daily calories")
                        Spacer()
                        TextField("2000", text: $calories)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 90)
                            .focused($targetFieldFocused)
                    }
                    HStack {
                        Text("Daily protein")
                        Spacer()
                        TextField("150", text: $protein)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 90)
                            .focused($targetFieldFocused)
                        Text("g").foregroundStyle(.secondary)
                    }
                    Button(savingTargets ? "Saving…" : "Save targets") {
                        Task { await saveTargets() }
                    }
                    .disabled(savingTargets || Int(calories) == nil || Int(protein) == nil)
                } header: {
                    Text("Daily targets")
                } footer: {
                    if let targetsMessage {
                        Text(targetsMessage)
                    } else {
                        Text("What the rings on Today measure against. You can also just tell the coach.")
                    }
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
            // A number pad has no return key, so without this the keyboard
            // covers the tab bar and there is no way back to Today.
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { targetFieldFocused = false }
                }
            }
        }
        .task {
            status = await PushRegistrar.shared.currentAuthorizationStatus()
            await loadTargets()
        }
    }

    private func loadTargets() async {
        guard let existing = try? await state.client.targets() else { return }
        calories = String(existing.calories)
        protein = String(existing.protein)
    }

    private func saveTargets() async {
        guard let kcal = Int(calories), let grams = Int(protein) else { return }
        savingTargets = true
        defer { savingTargets = false }
        targetFieldFocused = false
        do {
            _ = try await state.client.setTargets(calories: kcal, protein: grams)
            targetsMessage = "Saved."
        } catch APIError.unauthorized {
            state.handleUnauthorized()
        } catch APIError.badStatus(400) {
            // The server bounds these; say so rather than "something failed".
            targetsMessage = "Calories must be 500–10,000 and protein 20–500."
        } catch {
            targetsMessage = "Couldn't save that. Try again."
        }
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
