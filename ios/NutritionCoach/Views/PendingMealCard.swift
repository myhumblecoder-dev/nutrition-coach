import SwiftUI

/// The coach's read on a photo, sitting in the conversation as its own turn.
///
/// This replaced a modal confirm sheet. A sheet made logging a meal an
/// interruption to the conversation rather than part of it — you could not see
/// what you had said, could not scroll back, and could only answer in numbers.
/// The Telegram bot always did it this way: the coach says what it sees and
/// offers two buttons, in the thread, where the rest of the talking happens.
///
/// Two ways to disagree, because they fix different things. The steppers fix a
/// number. Saying "that's chicken, not turkey" fixes the reason the number was
/// wrong — and that is the one the rest of this app is built around.
struct PendingMealCard: View {
    let analysis: MealAnalysis
    let isBusy: Bool
    let onLog: (Int, Int) -> Void
    let onDiscard: () -> Void

    @State private var calories: Int
    @State private var protein: Int

    init(
        analysis: MealAnalysis,
        isBusy: Bool,
        onLog: @escaping (Int, Int) -> Void,
        onDiscard: @escaping () -> Void
    ) {
        self.analysis = analysis
        self.isBusy = isBusy
        self.onLog = onLog
        self.onDiscard = onDiscard
        _calories = State(initialValue: analysis.totalCalories)
        _protein = State(initialValue: analysis.totalProtein)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("I see:")
                .font(.footnote.weight(.medium))
                .foregroundStyle(Theme.muted)

            ForEach(Array(analysis.foodItems.enumerated()), id: \.offset) { _, item in
                HStack(alignment: .firstTextBaseline) {
                    Text(item.name).font(.subheadline).foregroundStyle(Theme.ink)
                    Spacer(minLength: 8)
                    Text(item.portion)
                        .font(.caption)
                        .foregroundStyle(Theme.secondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Theme.track)
                        .clipShape(Capsule())
                }
            }

            Divider().overlay(Theme.rowBorder)

            stepper("Calories", value: $calories, step: 10, unit: "cal")
            stepper("Protein", value: $protein, step: 5, unit: "g")

            HStack(spacing: 8) {
                Button(role: .destructive, action: onDiscard) {
                    Text("Discard").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)

                Button { onLog(calories, protein) } label: {
                    Text("Log it").frame(maxWidth: .infinity).fontWeight(.semibold)
                }
                .buttonStyle(.borderedProminent)
                .tint(Theme.accent)
            }
            .disabled(isBusy)
            .padding(.top, 2)

            // Says out loud that the composer is still live. Without it the two
            // buttons read as the only available answers, and the better one —
            // telling the coach what it got wrong — goes unused.
            Text("Or just tell me what I got wrong.")
                .font(.caption)
                .foregroundStyle(Theme.faint)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Theme.cardRadius))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.cardRadius)
                .stroke(Theme.cardBorder, lineWidth: 1)
        )
        .opacity(isBusy ? 0.6 : 1)
    }

    /// A stepper, not a text field: this is a nudge to an estimate, and a
    /// keyboard covering the conversation to change 340 to 350 costs more than
    /// the edit is worth.
    private func stepper(_ label: String, value: Binding<Int>, step: Int, unit: String) -> some View {
        Stepper(value: value, in: 0...20000, step: step) {
            HStack {
                Text(label).font(.subheadline).foregroundStyle(Theme.secondary)
                Spacer()
                Text("\(value.wrappedValue) \(unit)")
                    .font(.subheadline.weight(.semibold).monospacedDigit())
                    .foregroundStyle(Theme.ink)
            }
        }
        .accessibilityLabel("\(label), \(value.wrappedValue) \(unit)")
    }
}
