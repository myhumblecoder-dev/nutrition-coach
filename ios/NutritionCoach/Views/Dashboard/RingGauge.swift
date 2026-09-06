import SwiftUI

/// The calories and protein rings, mirroring `src/components/RingGauge.tsx`.
///
/// Proportions are taken from the web component rather than re-invented:
/// radius 0.424 of the box, stroke 1/12, value at 0.2 and the sub-label at
/// 0.09. Keeping the ratios means the two clients look like one product at any
/// size.
struct RingGauge: View {
    let value: Double
    let max: Double
    let centerText: String
    let subText: String
    let label: String
    var size: CGFloat = 148

    /// Clamped at 1: the arc stops at a full circle rather than lapping, which
    /// would render 2,400 of 2,000 as a nearly-empty ring.
    private var fraction: Double {
        guard max > 0 else { return 0 }
        return Swift.min(1, value / max)
    }

    var body: some View {
        VStack(spacing: 6) {
            ZStack {
                Circle()
                    .stroke(Theme.track, lineWidth: size / 12)

                Circle()
                    .trim(from: 0, to: fraction)
                    .stroke(
                        Theme.accent,
                        style: StrokeStyle(lineWidth: size / 12, lineCap: .round)
                    )
                    // Start at twelve o'clock, like the web's rotate(-90).
                    .rotationEffect(.degrees(-90))

                VStack(spacing: 2) {
                    Text(centerText)
                        .font(.system(size: size * 0.2, weight: .bold))
                        .foregroundStyle(Theme.ink)
                    Text(subText)
                        .font(.system(size: size * 0.09))
                        .foregroundStyle(Theme.muted)
                }
            }
            .frame(width: size * 0.848, height: size * 0.848)
            .padding(size / 12)

            Text(label)
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.secondary)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label): \(centerText) \(subText)")
    }
}
