import SwiftUI

/// The coach's latest line, above the receipts feed.
/// Mirrors `src/components/CoachStrip.tsx`, including its accent wash.
struct CoachStrip: View {
    let message: String
    /// Tapping through to the conversation the line came from.
    let onOpenChat: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 6)
                .fill(Theme.accent)
                .frame(width: 36, height: 36)
                .overlay(
                    Image(systemName: "quote.bubble.fill")
                        .font(.system(size: 16))
                        .foregroundStyle(.white)
                )

            Text(message)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Theme.accentInk)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)

            Button("Open chat", action: onOpenChat)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(Theme.accent)
                .fixedSize()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Theme.accentWash)
        .clipShape(RoundedRectangle(cornerRadius: Theme.cardRadius))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.cardRadius)
                .stroke(Theme.accentWashBorder, lineWidth: 1)
        )
    }
}
