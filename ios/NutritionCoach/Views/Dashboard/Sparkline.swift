import SwiftUI

/// The weight trend — the web's "172.0 lb · −1.4 in 30d" card.
///
/// Drawn with a Path rather than Swift Charts: it is a single unlabelled
/// trend line with no axes or interaction, and Charts would bring its own
/// styling to fight with the design tokens.
struct Sparkline: View {
    let points: [Double]
    var lineWidth: CGFloat = 2

    /// A flat series has no range to scale against, so it is drawn down the
    /// middle rather than dividing by zero.
    private func normalised(in size: CGSize) -> [CGPoint] {
        guard points.count > 1 else { return [] }

        let lowest = points.min() ?? 0
        let highest = points.max() ?? 0
        let span = highest - lowest
        let stepX = size.width / CGFloat(points.count - 1)

        return points.enumerated().map { index, value in
            let ratio = span == 0 ? 0.5 : (value - lowest) / span
            // Inverted: a higher weight belongs higher up the view, and the
            // origin is top-left.
            return CGPoint(x: CGFloat(index) * stepX, y: size.height * (1 - ratio))
        }
    }

    var body: some View {
        GeometryReader { geometry in
            let coords = normalised(in: geometry.size)

            if coords.count > 1 {
                ZStack {
                    Path { path in
                        path.move(to: coords[0])
                        for point in coords.dropFirst() { path.addLine(to: point) }
                    }
                    .stroke(
                        Theme.accent,
                        style: StrokeStyle(lineWidth: lineWidth, lineJoin: .round)
                    )

                    // The latest reading, so the eye lands on where you are now
                    // rather than on the whole line.
                    if let last = coords.last {
                        Circle()
                            .fill(Theme.accentDark)
                            .frame(width: lineWidth * 2.5, height: lineWidth * 2.5)
                            .position(last)
                    }
                }
            }
        }
        .accessibilityHidden(true)
    }
}
