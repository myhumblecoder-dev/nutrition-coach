import SwiftUI

/// How much caffeine is still in you, and how much longer you will feel it.
///
/// Not a `StatBar`: that one counts sessions towards a target you are trying
/// to reach, and 400mg is a reference figure, not something to aim at. The bar
/// here is a level, which is why an empty one is the good news and the row
/// stays visible to say so.
struct CaffeineRow: View {
    let status: CaffeineStatus?

    private var reading: CaffeineReading { CaffeineReading(status) }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text("Caffeine")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.secondary)
                Spacer()

                switch reading {
                case .nothingLogged:
                    // Green and ticked, like the web card. An empty tank is
                    // not a gap in the data to apologise for.
                    Label("none logged", systemImage: "checkmark")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.accentDark)
                        .labelStyle(.titleAndIcon)

                case .active(let milligrams, let summary, _):
                    Text("\(milligrams) mg")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                    Text("· \(summary)")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.faint)
                }
            }

            if case .active(_, _, let fraction) = reading {
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
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }

    private var accessibilityText: String {
        switch reading {
        case .nothingLogged:
            return "Caffeine: none logged"
        case .active(let milligrams, let summary, _):
            return "Caffeine: \(milligrams) milligrams, \(summary)"
        }
    }
}
