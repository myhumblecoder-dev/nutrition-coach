import Foundation
import Security

/// Where the bearer session token lives.
///
/// Abstracted so tests can substitute an in-memory store: the Keychain is
/// unavailable in a unit-test bundle without an entitled host app.
protocol TokenStoring: AnyObject {
    func read() -> String?
    func write(_ token: String)
    func clear()
}

final class InMemoryTokenStore: TokenStoring {
    private var token: String?
    init(token: String? = nil) { self.token = token }
    func read() -> String? { token }
    func write(_ token: String) { self.token = token }
    func clear() { token = nil }
}

/// Keychain-backed store. Never UserDefaults: the session token is a bearer
/// credential, so a device backup or a jailbroken read must not surrender it.
final class KeychainTokenStore: TokenStoring {
    private let service = "dev.myhumblecoder.nutritioncoach"
    private let account: String

    /// The account name separates the items sharing this service: the session
    /// token and the App Attest key identifier live in the same Keychain
    /// service but must not overwrite each other.
    init(account: String = "session-token") {
        self.account = account
    }

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    func read() -> String? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func write(_ token: String) {
        // Delete-then-add rather than update: simpler than branching on
        // whether an item already exists, and idempotent either way.
        SecItemDelete(baseQuery as CFDictionary)

        var query = baseQuery
        query[kSecValueData as String] = Data(token.utf8)
        // ThisDeviceOnly keeps the token out of iCloud Keychain backups.
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(query as CFDictionary, nil)
    }

    func clear() {
        SecItemDelete(baseQuery as CFDictionary)
    }
}
