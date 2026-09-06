import SwiftUI

/// A labelled progress bar — resistance 3 / 3–5, steps 6,540 / 10,000.
struct StatBar: View {
    let label: String
    let value: Int
    /// The denominator used to fill the bar.
    let target: Int
    /// What is printed after the value. A range like "3–5" cannot be derived
    /// from `target` alone, so the caller supplies the text.
    let targetText: String
    var valueText: String?

    private var fraction: Double {
        guard target > 0 else { return 0 }
        return Swift.min(1, Double(value) / Double(target))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(label)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.secondary)
                Spacer()
                Text(valueText ?? "\(value)")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                Text(targetText)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.faint)
            }

            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.track)
                    Capsule()
                        .fill(Theme.accent)
                        .frame(width: geometry.size.width * fraction)
                }
            }
            .frame(height: 6)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label): \(valueText ?? "\(value)") \(targetText)")
    }
}
