import Foundation
import StoreKit

/// The purchase side of the subscription.
///
/// StoreKit 2 directly, with no third-party SDK: this is one group with two
/// products, and RevenueCat's dependency and revenue share would buy nothing
/// that `Product` and `Transaction` do not already give.
///
/// Its only job beyond StoreKit is handing every verified transaction to the
/// server, which is why `submit` is injected — it makes the whole purchase
/// path testable against a local configuration with no network in it.
///
/// The server is idempotent by design, which matters here: StoreKit replays
/// unfinished transactions on every launch, so the same signed transaction is
/// posted more than once and must not mind.
@MainActor
@Observable
final class Store {
    static let productIDs = [
        "dev.myhumblecoder.nutritioncoach.monthly",
        "dev.myhumblecoder.nutritioncoach.annual",
    ]

    private(set) var products: [Product] = []
    private(set) var isPurchasing = false

    private let submit: (String) async -> Void
    private var updates: Task<Void, Never>?

    init(submit: @escaping (String) async -> Void) {
        self.submit = submit
    }

    convenience init(client: APIClient) {
        self.init(submit: { jws in
            // Swallowed on purpose. A failed post is recoverable — StoreKit
            // replays the transaction next launch, and Restore is right there
            // — whereas throwing here would fail a purchase Apple has already
            // taken the money for.
            try? await client.submitTransaction(jws)
        })
    }

    // No deinit cancelling `updates`: it is MainActor-isolated and deinit is
    // not, and this object lives for the life of the app anyway. The task
    // holds self weakly, so it goes inert rather than keeping anything alive.

    /// Loads the products, in the order the paywall shows them.
    ///
    /// An empty result is the symptom of an inactive Paid Applications
    /// agreement, not of a coding error — worth knowing, because StoreKit
    /// reports it as success with nothing in it.
    func loadProducts() async throws {
        let loaded = try await Product.products(for: Store.productIDs)

        // Monthly first: it is the one most people take, and the annual only
        // reads as a saving standing next to it.
        products = loaded.sorted { first, _ in
            first.id == Store.productIDs[0]
        }
    }

    /// Starts listening for transactions that arrive outside a purchase —
    /// renewals, a purchase made on another device, anything StoreKit finished
    /// while the app was closed.
    func listenForUpdates() {
        updates?.cancel()
        updates = Task { [weak self] in
            for await result in Transaction.updates {
                await self?.handle(result)
            }
        }
    }

    func purchase(_ product: Product) async throws {
        isPurchasing = true
        defer { isPurchasing = false }

        switch try await product.purchase() {
        case .success(let verification):
            await handle(verification)
        case .userCancelled, .pending:
            // Neither is an error. Pending is Ask to Buy waiting on a parent,
            // and the transaction arrives through `Transaction.updates` if it
            // is ever approved.
            break
        @unknown default:
            break
        }
    }

    /// Re-sends whatever this Apple ID is already entitled to.
    ///
    /// Reinstalling, or signing in on a second device, has to get the
    /// subscription back without paying again — and App Review requires the
    /// control that calls this.
    func restore() async {
        for await result in Transaction.currentEntitlements {
            await handle(result)
        }
    }

    /// Posts a transaction the moment StoreKit vouches for it, and finishes it
    /// only afterwards.
    ///
    /// Order matters: finishing first would drop it from `Transaction.updates`,
    /// so a post that failed could never be retried automatically.
    private func handle(_ result: VerificationResult<Transaction>) async {
        guard case .verified(let transaction) = result else {
            // Unverified means the signature did not check out. The server
            // would refuse it anyway; there is nothing to salvage.
            return
        }

        await submit(result.jwsRepresentation)
        await transaction.finish()
    }
}
