import Foundation

/// Runs attested requests one at a time, end to end.
///
/// App Attest assertions carry a counter the server requires to strictly
/// increase (`verifyRequestAssertion` in `src/lib/attest.ts`). With a single
/// request path that was academic — nothing ran concurrently. A Siri intent
/// running in the background while the app is in the foreground makes it real.
///
/// The failure is nasty out of proportion to its cause. Two assertions
/// generated close together can reach the server out of order; the server
/// rejects the lower counter with 401; `APIClient.validate` maps 401 to
/// `tokenStore.clear()`, on the reasonable assumption that a 401 means a
/// revoked session. The user is signed out, silently, having done nothing.
///
/// Serialising the whole cycle rather than just the signing is the point:
/// holding the lock only while generating the assertion would still let the
/// requests race on the wire. The cost is that attested calls do not overlap,
/// which this app can afford — it makes a handful of requests a minute, not a
/// stream.
actor AttestedRequestQueue {
    /// The tail of the chain. Each new piece of work waits on the previous one
    /// and becomes the thing the next waits on.
    private var tail: Task<Void, Never> = Task {}

    func run<T: Sendable>(_ work: @escaping @Sendable () async throws -> T) async throws -> T {
        let previous = tail

        let task = Task<T, Error> {
            // Deliberately ignores whether the previous call succeeded: a
            // failed request must not wedge the queue behind it.
            await previous.value
            return try await work()
        }

        tail = Task { _ = try? await task.value }

        return try await task.value
    }
}
