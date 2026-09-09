import Foundation

/// The Caffeine row, resolved from what the server sent.
///
/// A separate type from `CaffeineStatus` because the two answer different
/// questions: the DTO is pharmacokinetics, this is what to put on screen. It
/// is also the only part of the row worth testing, and a view is a poor place
/// to keep something worth testing.
///
/// Mirrors `RecoveryCard.tsx`, which shows the row whether or not there is
/// anything in it — an absent reading is information here, not a reason to
/// hide the row.
enum CaffeineReading: Equatable {
    /// No caffeine logged today. Distinct from a dose that has worn off: one
    /// means you had none, the other that you had some and it is done.
    case nothingLogged
    case active(milligrams: Int, summary: String, fraction: Double)

    /// What the bar fills against. The FDA's everyday reference figure, and
    /// the same denominator the web card uses — not a target to reach.
    static let dailyReferenceMg: Double = 400

    init(_ status: CaffeineStatus?) {
        guard let status else {
            self = .nothingLogged
            return
        }

        let hours = status.hoursUntilEffectsFade
        self = .active(
            milligrams: Int(status.currentMg.rounded()),
            // The server sends 0 once the level is under the threshold at
            // which caffeine is still felt. There is usually some left in you
            // at that point, so this says the effect ended rather than that
            // the caffeine did.
            summary: hours <= 0 ? "worn off" : "effects ~\(hours.formatted())h",
            fraction: min(1, max(0, status.currentMg / Self.dailyReferenceMg))
        )
    }
}
