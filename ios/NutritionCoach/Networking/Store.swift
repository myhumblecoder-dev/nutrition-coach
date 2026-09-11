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

    /// Returns whether the server accepted it. The result is the whole point:
    /// an unfinished transaction is StoreKit's own retry mechanism, and it
    /// only works if a failed post leaves the transaction unfinished.
    private let submit: (String) async -> Bool
    private var updates: Task<Void, Never>?

    init(submit: @escaping (String) async -> Bool) {
        self.submit = submit
    }

    convenience init(client: APIClient) {
        self.init(submit: { jws in
            do {
                _ = try await client.submitTransaction(jws)
                return true
            } catch {
                // Reported, not thrown: the money is already taken, so failing
                // the purchase would be a lie. Returning false leaves the
                // transaction unfinished, which is what gets it retried — a
                // post that failed because the server was down, or because
                // this launch had no session yet, comes back on its own.
                return false
            }
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
        //
        // By position in `productIDs`, not by "is it the first one" — that
        // comparator returns true for two equal elements, which is not a
        // strict weak ordering and so is undefined behaviour. It happened to
        // work only because there are exactly two products.
        products = loaded.sorted { a, b in
            let first = Store.productIDs.firstIndex(of: a.id) ?? .max
            let second = Store.productIDs.firstIndex(of: b.id) ?? .max
            return first < second
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

    #if DEBUG
    /// Exposes the injected `submit` so a test can assert on what it reports.
    /// `handle` needs a real `Transaction`, which only StoreKit can make.
    func postForTesting(_ jws: String) async -> Bool {
        await submit(jws)
    }
    #endif

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
    /// only if the server took it.
    ///
    /// Finishing is an acknowledgement, so it has to wait for the thing being
    /// acknowledged. A transaction finished after a failed post is gone from
    /// `Transaction.updates` for good, and the user has paid for an
    /// entitlement the server never heard about — recoverable only by finding
    /// Restore, which nobody thinks to do because nothing looks broken.
    ///
    /// Left unfinished, StoreKit redelivers it at the next launch until it
    /// sticks. That is the whole retry mechanism, and it is why `submit`
    /// reports success rather than swallowing it.
    private func handle(_ result: VerificationResult<Transaction>) async {
        guard case .verified(let transaction) = result else {
            // Unverified means the signature did not check out. The server
            // would refuse it anyway; there is nothing to salvage.
            return
        }

        guard await submit(result.jwsRepresentation) else { return }
        await transaction.finish()
    }
}
