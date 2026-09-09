import UserNotifications

/// Three nudges a day, scheduled on the device rather than sent from a server.
///
/// The timing is the whole reason this is local. A server cron fires at a
/// fixed UTC time, so delivering "what's for lunch?" at the user's one o'clock
/// would mean an hourly job picking out whoever is currently at 13:00 — and
/// getting it wrong sends breakfast prompts to people asleep. iOS already
/// schedules against a wall clock and follows timezone changes itself.
///
/// It also means these keep working with no network, no server, and no model
/// call. The copy is written rather than generated because a nudge does not
/// need to know anything: "what's breakfast?" is the same question every
/// morning. The coach's actual voice lives in the chat and the weekly
/// check-in, where personalisation earns what it costs.
///
/// What it gives up: at fire time the phone does not know what has already
/// been logged, so the copy is written not to assume.
enum MealReminders {
    struct Reminder {
        let id: String
        let hour: Int
        let title: String
        let body: String
    }

    /// Stable identifiers, because scheduling a request with an existing id
    /// replaces it. Fresh ids each time would stack duplicates until the
    /// 64-pending limit silently dropped the rest.
    static let all: [Reminder] = [
        Reminder(
            id: "meal-reminder-morning",
            hour: 9,
            title: "Morning",
            body: "What's breakfast looking like, hon?"
        ),
        Reminder(
            id: "meal-reminder-midday",
            hour: 13,
            title: "Lunch",
            body: "What'd you have? Tell me before you forget it."
        ),
        Reminder(
            id: "meal-reminder-evening",
            hour: 19,
            title: "Evening",
            body: "How'd today go? I'll take it in your own words."
        ),
    ]

    static var identifiers: [String] { all.map(\.id) }

    /// Pinned to the zone chosen in Settings rather than the device's own.
    ///
    /// Those can disagree — someone sets London on a phone in New York — and
    /// the caps and rings already follow the Settings choice. Notifications
    /// arriving on a different schedule from the day they belong to would be
    /// impossible to explain from inside the app.
    static func requests(timeZoneIdentifier: String) -> [UNNotificationRequest] {
        // The identifier reaches here from the server, which took it from a
        // client. An unrecognised one falls back to the device rather than
        // scheduling nothing at all.
        let zone = TimeZone(identifier: timeZoneIdentifier) ?? .current

        return all.map { reminder in
            var components = DateComponents()
            components.timeZone = zone
            components.hour = reminder.hour
            components.minute = 0
            // Hour and minute only: adding a day would pin it to one date and
            // it would fire once, ever.

            let content = UNMutableNotificationContent()
            content.title = reminder.title
            content.body = reminder.body
            content.sound = .default

            return UNNotificationRequest(
                identifier: reminder.id,
                content: content,
                trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
            )
        }
    }

    /// Replaces whatever was scheduled before. Called after authorisation, on
    /// launch, and whenever the timezone changes — all of which have to end in
    /// the same three notifications rather than three more.
    static func schedule(timeZoneIdentifier: String) async {
        let center = UNUserNotificationCenter.current()

        guard await center.notificationSettings().authorizationStatus == .authorized else {
            return
        }

        for request in requests(timeZoneIdentifier: timeZoneIdentifier) {
            try? await center.add(request)
        }
    }

    /// Removes them, for signing out or turning notifications off. Scoped to
    /// these identifiers so it cannot take anything else with it.
    static func cancel() {
        UNUserNotificationCenter.current()
            .removePendingNotificationRequests(withIdentifiers: identifiers)
    }
}
