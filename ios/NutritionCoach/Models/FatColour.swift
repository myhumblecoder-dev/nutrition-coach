import SwiftUI

/// The fat ring's colour, walked between two ends.
///
/// Mirrors `src/lib/fatColour.ts` — deliberately the same trivial maths, so
/// the two clients cannot drift into showing the same day in different hues.
/// Linear in sRGB: crude, but these two are close enough in luminance that the
/// midpoint does not go muddy.
///
/// A gradient rather than a traffic light. A day that is a little worse should
/// look a little worse, not flip at some invented threshold — and a threshold
/// would be a verdict, which is what `voice.ts` forbids pointing at a person.
enum FatColour {
    /// Nothing to say, so say nothing. A day with no fat is not the same as a
    /// day of bad fat, and colouring dry toast like crisps would be a lie.
    static func forShare(_ wholeFoodShare: Double?) -> Color {
        guard let share = wholeFoodShare else { return Theme.track }

        let t = Swift.min(1, Swift.max(0, share))
        return mix(from: Theme.fatRefined, to: Theme.fatWhole, t: t)
    }

    private static func mix(from: Color, to: Color, t: Double) -> Color {
        let a = UIColor(from).rgb
        let b = UIColor(to).rgb

        return Color(
            .sRGB,
            red: a.r + (b.r - a.r) * t,
            green: a.g + (b.g - a.g) * t,
            blue: a.b + (b.b - a.b) * t,
            opacity: 1
        )
    }
}

private extension UIColor {
    var rgb: (r: Double, g: Double, b: Double) {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        getRed(&r, green: &g, blue: &b, alpha: &a)
        return (Double(r), Double(g), Double(b))
    }
}
