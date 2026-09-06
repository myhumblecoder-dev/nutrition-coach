import SwiftUI

/// Seven days as filled or empty dots — the logging streak, and days with a
/// session. Monday-first, matching `startOfWeek` on the server.
struct DotGrid: View {
    let days: [Bool]
    var labels: [String] = ["M", "T", "W", "T", "F", "S", "S"]
    var showLabels = true

    var body: some View {
        HStack(spacing: 8) {
            ForEach(Array(days.prefix(7).enumerated()), id: \.offset) { index, filled in
                VStack(spacing: 4) {
                    Circle()
                        .fill(filled ? Theme.accent : Theme.track)
                        .frame(width: 10, height: 10)
                    if showLabels {
                        Text(index < labels.count ? labels[index] : "")
                            .font(.system(size: 10))
                            .foregroundStyle(Theme.faint)
                    }
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(days.filter { $0 }.count) of \(days.count) days")
    }
}
