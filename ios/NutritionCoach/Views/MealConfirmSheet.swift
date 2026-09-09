import SwiftUI

/// What the coach read from a photo, before it counts.
///
/// Mirrors `src/components/MealConfirmCard.tsx` section for section, the way
/// TodayView mirrors HomeClient — detected items, then the two numbers, then
/// the choice. The numbers are editable for the same reason they are on the
/// web: a vision estimate of a portion is a guess, and the person who ate the
/// meal knows better than the model does.
///
/// Dismissing without choosing is safe. The meal is already stored pending and
/// excluded from every total; it simply stays that way.
struct MealConfirmSheet: View {
    let analysis: MealAnalysis
    let onLogged: (Int, Int) async -> Void
    let onDiscarded: () async -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var calories: Int
    @State private var protein: Int
    @State private var isSaving = false

    init(
        analysis: MealAnalysis,
        onLogged: @escaping (Int, Int) async -> Void,
        onDiscarded: @escaping () async -> Void
    ) {
        self.analysis = analysis
        self.onLogged = onLogged
        self.onDiscarded = onDiscarded
        _calories = State(initialValue: analysis.totalCalories)
        _protein = State(initialValue: analysis.totalProtein)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    photo
                    detected
                    totals
                }
                .padding()
            }
            .background(Theme.pageBackground)
            .navigationTitle("Confirm meal")
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .bottom) { actions }
            .interactiveDismissDisabled(isSaving)
        }
    }

    /// The photo that produced these numbers, so the estimate can be checked
    /// against the thing it describes rather than taken on faith.
    private var photo: some View {
        AsyncImage(url: URL(string: analysis.photoUrl)) { image in
            image.resizable().scaledToFill()
        } placeholder: {
            Theme.track
        }
        .frame(height: 180)
        .frame(maxWidth: .infinity)
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: Theme.cardRadius))
    }

    private var detected: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Detected items")
                .font(.footnote.weight(.medium))
                .foregroundStyle(Theme.muted)

            ForEach(Array(analysis.foodItems.enumerated()), id: \.offset) { _, item in
                HStack {
                    Text(item.name).font(.subheadline).foregroundStyle(Theme.ink)
                    Spacer()
                    Text(item.portion)
                        .font(.caption)
                        .foregroundStyle(Theme.secondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Theme.track)
                        .clipShape(Capsule())
                }
            }
        }
        .dashboardCard()
    }

    private var totals: some View {
        VStack(spacing: 14) {
            stepperRow("Calories", value: $calories, step: 10, unit: "kcal")
            Divider().overlay(Theme.rowBorder)
            stepperRow("Protein", value: $protein, step: 5, unit: "g")
        }
        .dashboardCard()
    }

    /// A stepper rather than a text field: this is a correction to an estimate,
    /// not data entry, and a keyboard over a sheet to nudge 340 to 350 is more
    /// friction than the edit is worth.
    private func stepperRow(_ label: String, value: Binding<Int>, step: Int, unit: String) -> some View {
        Stepper(value: value, in: 0...20000, step: step) {
            HStack {
                Text(label).font(.subheadline).foregroundStyle(Theme.secondary)
                Spacer()
                Text("\(value.wrappedValue) \(unit)")
                    .font(.headline.monospacedDigit())
                    .foregroundStyle(Theme.ink)
            }
        }
        .accessibilityLabel("\(label), \(value.wrappedValue) \(unit)")
    }

    private var actions: some View {
        HStack(spacing: 12) {
            Button(role: .destructive) {
                Task {
                    isSaving = true
                    await onDiscarded()
                    dismiss()
                }
            } label: {
                Text("Discard").frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)

            Button {
                Task {
                    isSaving = true
                    await onLogged(calories, protein)
                    dismiss()
                }
            } label: {
                Text("Log it").frame(maxWidth: .infinity).fontWeight(.semibold)
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.accent)
        }
        .controlSize(.large)
        .disabled(isSaving)
        .padding()
        .background(.bar)
    }
}
