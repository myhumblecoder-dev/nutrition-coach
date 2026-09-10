import SwiftUI

/// Past conversations, one day at a time.
///
/// The chat opens on today only, so this is how anything older is reachable.
/// Days rather than an endless scroll because a day is the unit this product
/// works in — Today's rings, the daily caps and the receipts feed all turn
/// over together, and a conversation belongs to the same day they do.
///
/// Read-only. Replying to Tuesday would either log food against the wrong day
/// or quietly log it against this one, and both are worse than not offering.
struct ChatHistoryView: View {
    @Environment(AppState.self) private var state

    @State private var days: [ChatDay] = []
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        List {
            if isLoading {
                HStack { Spacer(); ProgressView(); Spacer() }
            } else if let error {
                Text(error).font(.footnote).foregroundStyle(.red)
            } else if days.isEmpty {
                Text("Nothing here yet. Today's talking will show up tomorrow.")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
            } else {
                ForEach(days) { day in
                    NavigationLink {
                        ChatDayView(day: day)
                    } label: {
                        HStack {
                            Text(readable(day.date)).foregroundStyle(Theme.ink)
                            Spacer()
                            Text("\(day.messageCount)")
                                .font(.footnote)
                                .foregroundStyle(Theme.faint)
                        }
                    }
                }
            }
        }
        .navigationTitle("History")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    /// "2026-09-08" as "Tuesday, Sep 8" — and "Today" or "Yesterday" where
    /// that is what someone would actually call it.
    private func readable(_ date: String) -> String {
        guard let parsed = ChatHistoryView.isoFormatter.date(from: date) else { return date }

        if Calendar.current.isDateInToday(parsed) { return "Today" }
        if Calendar.current.isDateInYesterday(parsed) { return "Yesterday" }

        return ChatHistoryView.dayFormatter.string(from: parsed)
    }

    /// UTC, because the server sends a calendar date rather than an instant —
    /// parsing it in device-local time would shift it a day for anyone west of
    /// Greenwich, the same bug `CalendarDate` exists to avoid elsewhere.
    private static let isoFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter
    }()

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, MMM d"
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter
    }()

    private func load() async {
        defer { isLoading = false }
        do {
            days = try await state.client.chatDays()
        } catch APIError.unauthorized {
            state.handleUnauthorized()
        } catch {
            self.error = "Couldn't load your history."
        }
    }
}

/// One past day's transcript, read-only.
struct ChatDayView: View {
    let day: ChatDay

    @Environment(AppState.self) private var state

    @State private var messages: [ChatMessage] = []
    @State private var isLoading = true

    var body: some View {
        ScrollView {
            if isLoading {
                ProgressView().padding(.top, 40)
            } else {
                LazyVStack(alignment: .leading, spacing: 12) {
                    ForEach(messages) { message in
                        Text(message.content)
                            .padding(10)
                            .background(
                                message.isFromCoach
                                    ? Color(.secondarySystemBackground)
                                    : Color.accentColor
                            )
                            .foregroundStyle(message.isFromCoach ? Color.primary : Color.white)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                            .frame(
                                maxWidth: .infinity,
                                alignment: message.isFromCoach ? .leading : .trailing
                            )
                    }
                }
                .padding()
            }
        }
        .background(Theme.pageBackground)
        .navigationTitle(day.date)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            defer { isLoading = false }
            messages = (try? await state.client.chatHistory(date: day.date)) ?? []
        }
    }
}
