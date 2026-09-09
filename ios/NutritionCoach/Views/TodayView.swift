import SwiftUI

/// The mirror.
///
/// Every number here traces back to something the user told the coach — that
/// is the product's whole claim, and the receipts feed at the bottom is the
/// evidence for it. Nothing on this screen is an input: there is no form,
/// because the conversation is the form.
///
/// Composed to match `src/app/HomeClient.tsx` section for section, so the
/// phone and the web read as the same product.
struct TodayView: View {
    @Environment(AppState.self) private var state
    /// Set by the coach strip's "Open chat", which switches tabs.
    @Binding var selectedTab: Int

    @State private var dashboard: DashboardResponse?
    @State private var isLoading = true
    @State private var error: String?

    /// Scroll target for the screenshot run.
    fileprivate static let feedAnchor = "activity-feed"

    /// Always the real date in a Release build; pinned during a screenshot run
    /// so the captured image does not change every day.
    private static var displayDate: Date {
        #if DEBUG
        DemoMode.fixedToday ?? Date()
        #else
        Date()
        #endif
    }

    private static let heading: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, MMM d"
        return formatter
    }()

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    if isLoading {
                        ProgressView().padding(.top, 60)
                    } else if let dashboard {
                        content(dashboard)
                    } else {
                        unavailable
                    }
                }
                .background(Theme.pageBackground)
                .navigationTitle("Today")
                #if DEBUG
                // Screenshot runs capture the receipts feed, which sits below
                // the fold. Inert without the launch argument.
                .onChange(of: dashboard == nil) { _, loaded in
                    guard !loaded, DemoMode.scrollsToFeed else { return }
                    Task { @MainActor in
                        try? await Task.sleep(for: .milliseconds(300))
                        withAnimation { proxy.scrollTo(TodayView.feedAnchor, anchor: .bottom) }
                    }
                }
                #endif
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func content(_ data: DashboardResponse) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            subheading(data)
            rings(data)
            remaining(data)
            training(data.week)
            recovery(data.week)

            if let message = data.coachMessage, !message.isEmpty {
                CoachStrip(message: message) { selectedTab = 1 }
            }

            ActivityFeedView(items: data.activity)
                .id(TodayView.feedAnchor)
        }
        .padding(20)
    }

    /// "Sunday, Aug 31 · 1,085 kcal in, 88g protein to go" — the same line the
    /// web prints under its heading.
    private func subheading(_ data: DashboardResponse) -> some View {
        var line = Self.heading.string(from: Self.displayDate)
        line += " · \(data.today.consumed.calories.formatted()) kcal in"
        if let target = data.today.target {
            let toGo = Swift.max(0, target.protein - data.today.consumed.protein)
            line += ", \(toGo)g protein to go"
        }
        return Text(line)
            .font(.system(size: 14))
            .foregroundStyle(Theme.muted)
    }

    @ViewBuilder
    private func rings(_ data: DashboardResponse) -> some View {
        let today = data.today
        return Group {
        if let target = today.target {
            HStack(spacing: 0) {
                RingGauge(
                    value: Double(today.consumed.calories),
                    max: Double(target.calories),
                    centerText: today.consumed.calories.formatted(),
                    subText: "of \(target.calories.formatted()) kcal",
                    label: "Calories"
                )
                .frame(maxWidth: .infinity)

                RingGauge(
                    value: Double(today.consumed.protein),
                    max: Double(target.protein),
                    centerText: "\(today.consumed.protein)g",
                    subText: "of \(target.protein)g protein",
                    label: "Protein"
                )
                .frame(maxWidth: .infinity)
            }
            .dashboardCard()
        } else {
            noTargetsYet(coachMessage: data.coachMessage)
        }
        }
    }

    /// The first thing a new account sees, and a reviewer with it.
    ///
    /// A dashboard whose headline graphs are simply absent reads as broken
    /// rather than unconfigured, so this says what is missing, what will
    /// appear, and offers both routes to fixing it — the form, and the
    /// conversation the rest of the product runs on.
    private func noTargetsYet(coachMessage: String?) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            // Empty rings rather than an icon: it shows the shape of what is
            // coming, so the screen reads as unfinished rather than as an
            // error someone has to decode.
            HStack(spacing: 0) {
                ForEach(["Calories", "Protein"], id: \.self) { label in
                    VStack(spacing: 6) {
                        Circle()
                            .stroke(Theme.track, lineWidth: 88 / 12)
                            .frame(width: 74, height: 74)
                        Text(label)
                            .font(.system(size: 12.5))
                            .foregroundStyle(Theme.faint)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(.bottom, 4)

            Text("Set your daily targets to see these")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.ink)

            // The coach's own question, shown here rather than left waiting in
            // a tab a new user has no reason to open. This screen is where
            // they land, so this is where the conversation has to start.
            if let coachMessage, !coachMessage.isEmpty {
                Text(coachMessage)
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.accentInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.accentWash)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.rowRadius))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.rowRadius)
                            .stroke(Theme.accentWashBorder, lineWidth: 1)
                    )
            } else {
                Text("The rings measure what you have eaten against a daily calorie and protein goal. Nothing else on this screen needs them.")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 16) {
                // Chat leads: answering the coach is the route the product is
                // built around, and it also sets the targets. Settings is the
                // alternative, not the default.
                Button("Answer in chat") { selectedTab = 1 }
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.accent)
                Button("Set them myself") { selectedTab = 2 }
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.muted)
            }
        }
        .dashboardCard()
    }

    @ViewBuilder
    private func remaining(_ data: DashboardResponse) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if let target = data.today.target {
                let left = target.calories - data.today.consumed.calories
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("\(left)")
                        .font(.system(size: 30, weight: .bold))
                        .foregroundStyle(Theme.ink)
                    Text("kcal remaining")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.muted)
                }
            }

            let logged = data.week.streak.filter { $0 }.count
            Text("\(logged) of 7 days logged")
                .font(.system(size: 13))
                .foregroundStyle(Theme.secondary)
            DotGrid(days: data.week.streak, showLabels: false)
        }
        .dashboardCard()
    }

    private func training(_ week: WeekResponse) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Physical readiness")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.ink)

            StatBar(label: "Resistance", value: week.training.resistance, target: 5, targetText: "/ 3–5")
            StatBar(label: "HIIT", value: week.training.hiit, target: 2, targetText: "/ 2")
            StatBar(label: "Core", value: week.training.core, target: 3, targetText: "/ 3")
            StatBar(
                label: "Steps today",
                value: week.training.stepsToday,
                target: 10_000,
                targetText: "/ 10,000",
                valueText: week.training.stepsToday.formatted()
            )

            VStack(alignment: .leading, spacing: 6) {
                Text("Days with a session")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.muted)
                DotGrid(days: sessionDays(week.training.days))
            }
        }
        .dashboardCard()
    }

    /// A day counts if any discipline happened on it — the web's grid is one
    /// row per discipline, which is too wide for a phone.
    private func sessionDays(_ days: TrainingDays) -> [Bool] {
        (0..<7).map { index in
            let any = [days.resistance, days.hiit, days.core]
            return any.contains { $0.indices.contains(index) && $0[index] }
        }
    }

    private func recovery(_ week: WeekResponse) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Recovery & mind")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.ink)

            statRow("Sleep", week.recovery.sleepHours.map { "\($0.formatted())h" }, "target 7–9h")
            statRow("Water", week.recovery.waterLiters.map { "\($0.formatted())L" }, "/ 3.8L")
            // Between Water and Mood, matching the order of the web's
            // Recovery & mind card so the two read as one product.
            CaffeineRow(status: week.recovery.caffeine)
            statRow("Mood", week.mood.map { "\($0.score)/5" }, week.mood?.note ?? "")

            if let weight = week.measurement?.weightLb {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text("Weight").font(.system(size: 13)).foregroundStyle(Theme.secondary)
                        Spacer()
                        Text(weight.formatted())
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.ink)
                        Text("lb").font(.system(size: 12)).foregroundStyle(Theme.faint)
                    }
                    if week.weights.count > 1 {
                        Sparkline(points: week.weights.map(\.weightLb))
                            .frame(height: 36)
                    }
                }
            }
        }
        .dashboardCard()
    }

    private func statRow(_ label: String, _ value: String?, _ trailing: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label).font(.system(size: 13)).foregroundStyle(Theme.secondary)
            Spacer()
            // An absent reading is an em dash, not a zero: nothing logged and
            // zero hours' sleep are different facts.
            Text(value ?? "—")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(value == nil ? Theme.faint : Theme.ink)
            if !trailing.isEmpty {
                Text(trailing).font(.system(size: 12)).foregroundStyle(Theme.faint)
            }
        }
    }

    private var unavailable: some View {
        VStack(spacing: 8) {
            Text(error ?? "Couldn't load today.")
                .font(.system(size: 14))
                .foregroundStyle(Theme.muted)
            Button("Try again") { Task { await load() } }
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.accent)
        }
        .padding(.top, 60)
    }

    private func load() async {
        isLoading = dashboard == nil
        defer { isLoading = false }
        do {
            dashboard = try await state.client.dashboard()
            error = nil
        } catch APIError.unauthorized {
            state.handleUnauthorized()
        } catch {
            self.error = "Couldn't load today."
        }
    }
}
