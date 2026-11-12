// SPDX-License-Identifier: GPL-2.0
import CoreBluetooth
import Foundation

/// The state of the Bluetooth radio for bluetoothStatus and the permission request,
/// in the words of the JavaScript BluetoothStatus: "none", "off" or "on".
///
/// iOS only tells the radio's state to an app allowed to use Bluetooth, and asks
/// for that permission at the first CBCentralManager. So a status without
/// `prompting` does not create one while the permission is not asked yet, and says
/// "on" (not known); a refused permission also says "on".
final class BluetoothState: NSObject, CBCentralManagerDelegate {
    private let queue = DispatchQueue(label: "org.opendives.core.bluetooth.state")
    private var central: CBCentralManager?
    private var waiting: [(String) -> Void] = []
    private var giveUp: DispatchWorkItem?

    /// `prompting`: creating the manager is allowed to make iOS ask for the
    /// permission; the answer then comes once the diver has answered.
    func current(prompting: Bool, completion: @escaping (String) -> Void) {
        queue.async { [self] in
            if central == nil {
                if !prompting && CBCentralManager.authorization == .notDetermined {
                    completion("on")
                    return
                }
                central = CBCentralManager(
                    delegate: self,
                    queue: queue,
                    options: [CBCentralManagerOptionShowPowerAlertKey: false]
                )
            }
            waiting.append(completion)
            settle()
        }
    }

    // On `queue`.
    private func settle() {
        guard let central, !waiting.isEmpty else { return }
        switch central.state {
        case .poweredOn, .unauthorized:
            flush("on")
        case .poweredOff:
            flush("off")
        case .unsupported:
            flush("none")
        default:
            // Unknown or resetting. The permission prompt can stay open as long as the
            // diver wants; once it is answered, a state that does not come is given up.
            if CBCentralManager.authorization != .notDetermined && giveUp == nil {
                let item = DispatchWorkItem { [weak self] in self?.flush("on") }
                giveUp = item
                queue.asyncAfter(deadline: .now() + 3, execute: item)
            }
        }
    }

    private func flush(_ answer: String) {
        giveUp?.cancel()
        giveUp = nil
        let pending = waiting
        waiting = []
        for completion in pending { completion(answer) }
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        settle()
    }
}
