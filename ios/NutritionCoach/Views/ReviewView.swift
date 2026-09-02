import SwiftUI

/// Week over week, in the user's own words.
///
/// Deliberately no charts and no deltas: a computed trend line would be the
/// app asserting a precision it does not have. The receipt — what they said —
/// is the record.
struct ReviewView: View {
    @Environment(AppState.self) private var state

    @State private var history: [CheckInWeek] = []
    @State private var isLoading = true
    @State private var error: String?

    private static let weekFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM d"
        return formatter
    }()

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView()
                } else if history.isEmpty {
                    ContentUnavailableView(
                        "No check-ins yet",
                        systemImage: "calendar",
                        description: Text("Answer this week's questions and they'll appear here.")
                    )
                } else {
                    List(history) { week in
                        Section("Week of \(Self.weekFormatter.string(from: week.weekOf))") {
                            row("Body", week.body)
                            row("Strength", week.strength)
                            row("Sleep", week.sleep)
                            row("Mood", week.mood)
                        }
                    }
                }
            }
            .navigationTitle("Review")
        }
        .task { await load() }
        .refreshable { await load() }
    }

    @ViewBuilder
    private func row(_ label: String, _ answer: CheckInAnswer) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label).font(.subheadline.weight(.medium))
                Spacer()
                Text(answer.answer ?? "—")
                    .font(.subheadline)
                    .foregroundStyle(answer.isAnswered ? .primary : .secondary)
            }
            if let said = answer.said, !said.isEmpty {
                // The receipt: their words, not the summary.
                Text("“\(said)”")
                    .font(.footnote)
                    .italic()
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            history = try await state.client.checkIns().history
        } catch APIError.unauthorized {
            state.handleUnauthorized()
        } catch {
            self.error = "Couldn't load your review."
        }
    }
}
