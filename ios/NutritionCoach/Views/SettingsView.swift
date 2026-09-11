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
    @State private var timezone = "America/New_York"
    @State private var timezoneError: String?

    @State private var showingPaywall = false
    @State private var restoring = false
    @State private var subscriptionMessage: String?

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
                    NavigationLink {
                        TimeZonePicker(selected: timezone) { picked in
                            Task { await saveTimezone(picked) }
                        }
                    } label: {
                        HStack {
                            Text("Timezone")
                            Spacer()
                            Text(timezone).foregroundStyle(Theme.faint)
                        }
                    }
                } header: {
                    Text("Your day")
                } footer: {
                    if let timezoneError {
                        Text(timezoneError)
                    } else {
                        Text("When your day starts and ends — it decides when Today resets and when your daily limits refresh.")
                    }
                }

                subscriptionSection

                Section {
                    Link("Privacy policy", destination: AppState.privacyPolicyURL)
                    // Guideline 3.1.2 wants the EULA reachable from inside the
                    // app, not only from the paywall.
                    Link("Terms of use", destination: AppState.termsURL)
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
            .sheet(isPresented: $showingPaywall) {
                PaywallView(reason: nil)
            }
        .task {
            status = await PushRegistrar.shared.currentAuthorizationStatus()
            await loadTargets()
            await loadTimezone()
            await state.refreshEntitlement()
        }
    }

    /// Manage and Restore are not optional extras: App Review looks for both
    /// the day in-app purchase ships, and their absence is a rejection on its
    /// own.
    @ViewBuilder
    private var subscriptionSection: some View {
        Section {
            if state.isEntitled {
                // Apple's own page, not a screen of ours — cancelling has to
                // work even if this app is broken, and Apple requires the
                // link rather than an imitation of it.
                Link("Manage subscription", destination: URL(string: "https://apps.apple.com/account/subscriptions")!)
            } else {
                Button("Subscribe") { showingPaywall = true }
            }

            Button(restoring ? "Restoring…" : "Restore purchases") {
                Task { await restorePurchases() }
            }
            .disabled(restoring)
        } header: {
            Text("Subscription")
        } footer: {
            if let subscriptionMessage {
                Text(subscriptionMessage)
            } else {
                Text(statusLine)
            }
        }
    }

    private var statusLine: String {
        guard let entitlement = state.entitlement else { return "Checking…" }
        guard let expires = entitlement.expiresAt else {
            return entitlement.isEntitled ? "Active." : "No active subscription."
        }
        let when = expires.formatted(date: .abbreviated, time: .omitted)
        if entitlement.isTrialing { return "Free trial — full access until \(when)." }
        if entitlement.isEntitled { return "Renews \(when)." }
        return "Ended \(when). Your history is still here, read-only."
    }

    private func restorePurchases() async {
        restoring = true
        defer { restoring = false }
        subscriptionMessage = nil

        await state.store.restore()
        await state.refreshEntitlement()

        subscriptionMessage = state.isEntitled
            ? "Restored."
            : "No subscription found for this Apple Account."
    }

    private func loadTargets() async {
        guard let existing = try? await state.client.targets() else { return }
        calories = String(existing.calories)
        protein = String(existing.protein)
    }

    /// Read rather than assumed from the device: what this row shows has to be
    /// the zone the caps and the rings are actually using, and only the server
    /// knows that.
    private func loadTimezone() async {
        guard let existing = try? await state.client.timezone() else { return }
        timezone = existing
    }

    private func saveTimezone(_ identifier: String) async {
        let previous = timezone
        timezoneError = nil
        // Shown immediately, then put back if the server refuses — the list it
        // was picked from is the device's own, so a rejection is unlikely
        // enough that waiting on the round trip would be the worse trade.
        timezone = identifier

        do {
            timezone = try await state.client.setTimezone(identifier)
            // The nudges are pinned to this zone, so they have to move with
            // it — otherwise changing it here fixes the caps and the rings and
            // silently leaves the notifications on the old day.
            await MealReminders.schedule(timeZoneIdentifier: timezone)
        } catch APIError.unauthorized {
            state.handleUnauthorized()
        } catch {
            timezone = previous
            timezoneError = "Couldn't save that timezone. Try again."
        }
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
                    // Scheduled the moment permission exists. Waiting for the
                    // next launch would mean turning notifications on and
                    // getting nothing all day.
                    await MealReminders.schedule(timeZoneIdentifier: timezone)
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
