import SwiftUI

/// "From your conversation" — the receipts.
///
/// This is the screen's argument: the quoted words come first, then what the
/// coach logged from them. Mirrors `src/components/ActivityFeed.tsx`.
struct ActivityFeedView: View {
    let items: [ActivityItem]

    private static let time: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        return formatter
    }()

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if items.isEmpty {
                Text("Tell the coach about your day — meals, training, sleep — and it lands here.")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.muted)
            } else {
                Text("From your conversation")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.ink)

                VStack(spacing: 12) {
                    ForEach(items) { item in
                        row(for: item)
                    }
                }
            }
        }
    }

    private func row(for item: ActivityItem) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            // The receipt leads, because it is the point: the number below it
            // exists because of these words.
            if !item.sourceText.isEmpty {
                Text("“\(item.sourceText)”")
                    .font(.system(size: 14))
                    .italic()
                    .foregroundStyle(Theme.muted)
            }

            HStack(spacing: 8) {
                Image(systemName: "checkmark")
                    .font(.system(size: 12, weight: .heavy))
                    .foregroundStyle(Theme.accentDark)
                Text("Logged: \(item.label)")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Theme.ink)
                Spacer(minLength: 8)
                Text(Self.time.string(from: item.at))
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12).stroke(Theme.cardBorder, lineWidth: 1)
        )
    }
}
