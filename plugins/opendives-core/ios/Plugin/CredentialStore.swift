// SPDX-License-Identifier: GPL-2.0
import Foundation
import Security

/// A text in the Keychain, readable after the first unlock and never leaving this
/// device (no iCloud Keychain sync, no backup transfer). Counterpart of
/// SealedFile.kt. Nothing here is logged.
struct KeychainText {
    private static let service = "org.opendives.core"
    let account: String

    private var query: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.service,
            kSecAttrAccount as String: account,
            kSecAttrSynchronizable as String: kCFBooleanFalse as Any,
        ]
    }

    /// The text, or nil when there is none or it cannot be read.
    func read() -> String? {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(request as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func write(_ text: String) throws {
        let data = Data(text.utf8)
        let update = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if update == errSecSuccess { return }
        var item = query
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else {
            throw Failure("CORE_ERROR", "CREDENTIALS_NOT_SAVED")
        }
    }

    func delete() {
        SecItemDelete(query as CFDictionary)
    }
}

/// The Subsurface cloud account of this device: "email\npassword".
struct CredentialStore {
    private let item = KeychainText(account: "cloud-account")

    func read() -> (email: String, password: String)? {
        guard let text = item.read() else { return nil }
        let parts = text.split(separator: "\n", maxSplits: 1, omittingEmptySubsequences: false)
        guard parts.count == 2, !parts[0].isEmpty, !parts[1].isEmpty else { return nil }
        return (String(parts[0]), String(parts[1]))
    }

    func write(_ email: String, _ password: String) throws {
        try item.write("\(email)\n\(password)")
    }

    func delete() {
        item.delete()
    }
}

/// The user's own git repository, instead of the cloud account. `url` is
/// "address[branch]".
struct GitRemote {
    let url: String
    let username: String
    let branch: String
    let token: String

    /// The address without its "[branch]".
    var address: String {
        guard let bracket = url.lastIndex(of: "[") else { return url }
        return String(url[..<bracket])
    }
}

struct GitRemoteStore {
    /// The message of a refused write (an empty field or a line break), which the
    /// plugin lets through as CORE_ERROR as Android's IllegalArgumentException does.
    static let invalidMessage = "Invalid repository access"
    private let item = KeychainText(account: "git-remote")

    func read() -> GitRemote? {
        guard let text = item.read() else { return nil }
        let parts = text.components(separatedBy: "\n")
        if parts.count != 4 || parts.contains(where: { $0.isEmpty }) { return nil }
        return GitRemote(url: parts[0], username: parts[1], branch: parts[2], token: parts[3])
    }

    func write(_ remote: GitRemote) throws {
        let fields = [remote.url, remote.username, remote.branch, remote.token]
        if fields.contains(where: { $0.isEmpty || $0.contains("\n") }) {
            throw Failure("CORE_ERROR", Self.invalidMessage)
        }
        try item.write(fields.joined(separator: "\n"))
    }

    func delete() {
        item.delete()
    }
}
