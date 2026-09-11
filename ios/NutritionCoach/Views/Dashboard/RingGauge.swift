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
    /// Drives the fonts as well as the circle, so it is the real width — a
    /// ring cannot be shrunk by its container without its numbers shrinking
    /// too. Three-up needs about 112; two-up fits the original 148.
    var size: CGFloat = 148
    /// Overrides the arc colour. The fat ring uses it to say quality in hue.
    var color: Color = Theme.accent
    /// Draws the arc all the way round regardless of value.
    ///
    /// The fat ring has no target — fat guidance is a range, and a denominator
    /// would read as failure for something the app only estimates. Its fill is
    /// not progress towards anything; the circle is whole and the colour is
    /// the content.
    var full: Bool = false

    /// Clamped at 1: the arc stops at a full circle rather than lapping, which
    /// would render 2,400 of 2,000 as a nearly-empty ring.
    private var fraction: Double {
        if full { return 1 }
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
                        color,
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
                        // A backstop, not the plan. Labels are written short
                        // enough to fit (see `fatQualityLabel`); this keeps a
                        // longer one legible instead of clipped.
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
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
