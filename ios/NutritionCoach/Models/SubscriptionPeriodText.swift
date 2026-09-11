import Foundation

/// How a subscription period is said in English.
///
/// Two renderings, because the same period reads differently depending on what
/// it is doing in the sentence. A length has to say its number — "1 week free",
/// never "week free" — while a recurrence follows "per", where a lone 1 is
/// implied and saying it is wrong: "$7.99 per 1 month".
///
/// Separate from the view so both can be tested. The first version of this got
/// it wrong in exactly the way an untested formatter does: it had one function,
/// dropped the 1, and read correctly in the place that was being looked at.
enum SubscriptionPeriodText {
    enum Unit: String {
        case day, week, month, year
        case unknown
    }

    /// A length of time, as in "1 week free" or "3 days free".
    static func duration(value: Int, unit: Unit) -> String {
        "\(value) \(noun(unit, plural: value != 1))"
    }

    /// What follows "per", as in "per month" or "per 3 months".
    static func recurrence(value: Int, unit: Unit) -> String {
        value == 1 ? noun(unit, plural: false) : "\(value) \(noun(unit, plural: true))"
    }

    private static func noun(_ unit: Unit, plural: Bool) -> String {
        let singular: String
        switch unit {
        case .day: singular = "day"
        case .week: singular = "week"
        case .month: singular = "month"
        case .year: singular = "year"
        // Never expected — a period Apple adds after this ships. "3 periods"
        // is clumsy but true, which beats crashing or saying nothing.
        case .unknown: singular = "period"
        }
        return plural ? singular + "s" : singular
    }
}
