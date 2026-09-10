import SwiftUI
import StoreKit

/// The sheet that asks for money.
///
/// Guideline 3.1.2 is specific about what has to be on it, and getting any of
/// it wrong is a rejection rather than a note: the subscription's **title**,
/// its **length**, its **price**, and working links to the **Terms of Use**
/// and the **privacy policy**. Prices are read from `Product.displayPrice`
/// and never written here — Apple sets them per storefront, in the local
/// currency, and a hardcoded "$7.99" is wrong everywhere but the US.
///
/// It is raised when something is refused, not at launch: someone who has not
/// yet seen what the coach does has no reason to pay for it.
struct PaywallView: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    /// What was refused, in the server's own words, so the sheet opens by
    /// answering the thing the user just tried to do.
    let reason: String?

    @State private var loadError: String?
    @State private var restoring = false
    @State private var restoreMessage: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    header
                    benefits
                    products
                    restoreRow
                    legal
                }
                .padding(20)
            }
            .background(Theme.pageBackground)
            .navigationTitle("Subscribe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Not now") { dismiss() }
                }
            }
        }
        .task { await load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let reason {
                Text(reason)
                    .font(.headline)
                    .foregroundStyle(Theme.ink)
            } else {
                Text("Keep your coach")
                    .font(.headline)
                    .foregroundStyle(Theme.ink)
            }

            // Says plainly what lapsing costs and what it does not. The
            // history staying put is the part people actually worry about,
            // and it is true — a lapsed account is read-only, not deleted.
            Text("Your logged meals, weights and history stay yours either way. A subscription is what keeps the coach answering.")
                .font(.subheadline)
                .foregroundStyle(Theme.secondary)
        }
    }

    private var benefits: some View {
        VStack(alignment: .leading, spacing: 10) {
            benefit("Photograph a meal, get calories and protein back")
            benefit("Log by talking — no forms, no database of foods")
            benefit("Daily targets, rings, and a weekly check-in")
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.accentWash)
        .clipShape(RoundedRectangle(cornerRadius: Theme.cardRadius))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.cardRadius)
                .stroke(Theme.accentWashBorder, lineWidth: 1)
        )
    }

    private func benefit(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(Theme.accent)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(Theme.accentInk)
        }
    }

    @ViewBuilder
    private var products: some View {
        if let loadError {
            // An empty product list is normally an inactive Paid Applications
            // agreement or no network — never the user's fault, so it must not
            // read like a refusal, and must not leave a dead button behind.
            VStack(alignment: .leading, spacing: 12) {
                Text(loadError)
                    .font(.subheadline)
                    .foregroundStyle(Theme.secondary)
                Button("Try again") {
                    Task { await load() }
                }
                .buttonStyle(.bordered)
            }
        } else if state.store.products.isEmpty {
            ProgressView().frame(maxWidth: .infinity)
        } else {
            VStack(spacing: 12) {
                ForEach(state.store.products, id: \.id) { product in
                    productButton(product)
                }
            }
        }
    }

    private func productButton(_ product: Product) -> some View {
        Button {
            Task { await buy(product) }
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    // The subscription's own name and length, from StoreKit
                    // rather than from this file.
                    Text(product.displayName)
                        .font(.headline)
                    Spacer()
                    Text(product.displayPrice)
                        .font(.headline)
                }
                Text(termsLine(for: product))
                    .font(.footnote)
                    .opacity(0.9)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
        }
        .buttonStyle(.borderedProminent)
        .tint(Theme.accent)
        .disabled(state.store.isPurchasing)
    }

    /// Title, length and price in one line, which is what 3.1.2 is asking for:
    /// "$7.99 per month" — plus the free trial when there is one, described as
    /// what it converts to rather than as a giveaway.
    private func termsLine(for product: Product) -> String {
        guard let subscription = product.subscription else { return product.displayPrice }
        let period = describe(subscription.subscriptionPeriod)

        if let offer = subscription.introductoryOffer, offer.paymentMode == .freeTrial {
            return "\(describe(offer.period)) free, then \(product.displayPrice) per \(period). Renews until cancelled."
        }
        return "\(product.displayPrice) per \(period). Renews until cancelled."
    }

    private func describe(_ period: Product.SubscriptionPeriod) -> String {
        let unit: String
        switch period.unit {
        case .day: unit = "day"
        case .week: unit = "week"
        case .month: unit = "month"
        case .year: unit = "year"
        @unknown default: unit = "period"
        }
        return period.value == 1 ? unit : "\(period.value) \(unit)s"
    }

    private var restoreRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button(restoring ? "Restoring…" : "Restore purchases") {
                Task { await restore() }
            }
            .disabled(restoring)

            if let restoreMessage {
                Text(restoreMessage)
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
            }
        }
    }

    /// Both links are required, and a reviewer taps them. They point at the
    /// same URLs given to App Store Connect.
    private var legal: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(
                """
                Payment is charged to your Apple Account at confirmation. It renews \
                automatically unless turned off at least 24 hours before the period \
                ends. Manage or cancel in your Apple Account settings.
                """
            )
            .font(.caption)
            .foregroundStyle(Theme.muted)

            HStack(spacing: 16) {
                Button("Terms of Use") { openURL(AppState.termsURL) }
                Button("Privacy policy") { openURL(AppState.privacyPolicyURL) }
            }
            .font(.caption)
        }
    }

    private func load() async {
        loadError = nil
        do {
            try await state.store.loadProducts()
            if state.store.products.isEmpty {
                loadError = "Subscriptions aren't available right now. Please try again in a moment."
            }
        } catch {
            loadError = "Couldn't reach the App Store. Check your connection and try again."
        }
    }

    private func buy(_ product: Product) async {
        do {
            try await state.store.purchase(product)
            // The purchase posts its own transaction; this asks the server
            // what it made of it rather than assuming.
            await state.refreshEntitlement()
            if state.isEntitled { dismiss() }
        } catch {
            loadError = "That purchase didn't go through. You haven't been charged twice — try again."
        }
    }

    private func restore() async {
        restoring = true
        defer { restoring = false }
        restoreMessage = nil

        await state.store.restore()
        await state.refreshEntitlement()

        if state.isEntitled {
            dismiss()
        } else {
            restoreMessage = "No subscription found for this Apple Account."
        }
    }
}
