import SwiftUI

/// Where the day's eating sat between packaged food and real food.
///
/// Mirrors `src/components/ProcessingGauge.tsx`.
///
/// A bar rather than a ring, deliberately: rings on this screen measure
/// against a target, and this has none. There is nothing to reach — it is a
/// position, and a "get to 80% natural" goal would read as failure for a day
/// of unavoidable travel food.
///
/// No percentage anywhere. A marker on a labelled spectrum is something you
/// glance at; a number invites arithmetic and turns the gauge into a score.
///
/// The ends carry the fat ring's two colours, so the two features speak one
/// visual language — yellow is packaged, green is real, wherever it appears.
struct ProcessingGauge: View {
    /// 0 entirely ultra-processed, 1 entirely whole. Nil when unknown.
    let naturalShare: Double?
    let label: String?

    private let trackHeight: CGFloat = 8
    private let markerSize: CGFloat = 16

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Processed")
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(Theme.secondary)
                Spacer()
                // Nil is "nothing to say". Parking the marker at an end would
                // be a claim about the day that is not true, and every meal
                // already in the database names no group.
                Text(label ?? "nothing logged yet")
                    .font(.system(size: 12.5))
                    .foregroundStyle(label == nil ? Theme.faint : Theme.ink)
                Spacer()
                Text("Natural")
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(Theme.secondary)
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    if let share = naturalShare {
                        Capsule()
                            .fill(
                                LinearGradient(
                                    colors: [Theme.fatRefined, Theme.fatWhole],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(height: trackHeight)

                        // Ringed in white so it stays visible anywhere along
                        // the gradient.
                        Circle()
                            .fill(Theme.ink)
                            .overlay(Circle().stroke(.white, lineWidth: 2))
                            .frame(width: markerSize, height: markerSize)
                            .offset(
                                x: Swift.min(1, Swift.max(0, share)) * geo.size.width
                                    - markerSize / 2
                            )
                    } else {
                        Capsule()
                            .fill(Theme.track)
                            .frame(height: trackHeight)
                    }
                }
                .frame(height: markerSize)
            }
            .frame(height: markerSize)
        }
    }
}
