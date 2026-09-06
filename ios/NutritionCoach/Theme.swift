import SwiftUI

/// The web dashboard's design tokens, verbatim.
///
/// `docs/epics/phase-1f-dashboard-redesign.md` specifies these as literal hex
/// values taken from the approved mockups, and the web components hard-code
/// them rather than deriving them from a scale. The iOS Today screen is a
/// mirror of the web one, so it uses the same numbers — a "close enough"
/// SwiftUI system colour would put the two side by side and make the phone
/// look like a different product.
///
/// Deliberately not semantic (`.background`, `.accent`): these names match the
/// epic so a change there is greppable here.
enum Theme {
    static let pageBackground = Color(hex: 0xFAFAFA)
    static let cardBackground = Color(hex: 0xFFFFFF)
    static let cardBorder = Color(hex: 0xE4E4E7)
    static let rowBorder = Color(hex: 0xF0F0F1)

    static let ink = Color(hex: 0x18181B)
    static let secondary = Color(hex: 0x52525B)
    static let muted = Color(hex: 0x71717A)
    static let faint = Color(hex: 0xA1A1AA)

    static let track = Color(hex: 0xF0F0F1)
    static let accent = Color(hex: 0x059669)
    static let accentDark = Color(hex: 0x047857)
    static let accentWash = Color(hex: 0xECFDF5)
    static let accentWashBorder = Color(hex: 0xA7F3D0)
    /// The coach strip's text — darker than `accent` so it stays legible on
    /// `accentWash`.
    static let accentInk = Color(hex: 0x065F46)

    static let cardRadius: CGFloat = 14
    static let rowRadius: CGFloat = 10
}

extension Color {
    /// 0xRRGGBB, so the tokens above read the same as the CSS they mirror.
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}

/// The white card every dashboard section sits in.
struct CardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: Theme.cardRadius))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.cardRadius)
                    .stroke(Theme.cardBorder, lineWidth: 1)
            )
    }
}

extension View {
    func dashboardCard() -> some View { modifier(CardModifier()) }
}
