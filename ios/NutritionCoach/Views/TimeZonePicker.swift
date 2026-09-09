import SwiftUI

/// Choosing which timezone the day is measured in.
///
/// A searchable list rather than a wheel: there are several hundred IANA
/// identifiers and nobody scrolls to Europe/London. The device's own zone is
/// offered at the top as a suggestion — convenient, but still a choice, because
/// the day boundary decides when the caps reset and moving it under someone
/// for crossing a border would be a surprise.
struct TimeZonePicker: View {
    let selected: String
    let onPick: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var deviceZone: String { TimeZone.current.identifier }

    /// Identifiers the runtime actually knows, so nothing here can be refused
    /// by the server.
    private var matches: [String] {
        let all = TimeZone.knownTimeZoneIdentifiers.sorted()
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return all }

        return all.filter { $0.localizedCaseInsensitiveContains(trimmed) }
    }

    var body: some View {
        List {
            if query.isEmpty && deviceZone != selected {
                Section("On this phone") {
                    row(deviceZone)
                }
            }

            Section(query.isEmpty ? "All timezones" : "Matching “\(query)”") {
                ForEach(matches, id: \.self) { row($0) }
            }
        }
        .searchable(text: $query, prompt: "Search timezones")
        .navigationTitle("Timezone")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func row(_ identifier: String) -> some View {
        Button {
            onPick(identifier)
            dismiss()
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(readable(identifier)).foregroundStyle(Theme.ink)
                    Text(offsetLabel(identifier))
                        .font(.caption)
                        .foregroundStyle(Theme.faint)
                }
                Spacer()
                if identifier == selected {
                    Image(systemName: "checkmark").foregroundStyle(Theme.accent)
                }
            }
        }
    }

    /// "Europe/London" reads better as "London — Europe".
    private func readable(_ identifier: String) -> String {
        let parts = identifier.split(separator: "/").map { $0.replacingOccurrences(of: "_", with: " ") }
        guard let city = parts.last, parts.count > 1 else { return identifier }

        return "\(city) — \(parts.dropLast().joined(separator: " / "))"
    }

    /// The current offset, so someone who does not know the identifier can
    /// still recognise their own time.
    private func offsetLabel(_ identifier: String) -> String {
        guard let zone = TimeZone(identifier: identifier) else { return identifier }

        let minutes = zone.secondsFromGMT() / 60
        let sign = minutes < 0 ? "-" : "+"
        let absolute = abs(minutes)

        return String(format: "%@  GMT%@%02d:%02d", identifier, sign, absolute / 60, absolute % 60)
    }
}
