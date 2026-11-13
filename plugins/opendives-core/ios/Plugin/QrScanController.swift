// SPDX-License-Identifier: GPL-2.0
import AVFoundation
import UIKit

/// The full-screen camera that reads the QR codes of a dive or a plan shared from another
/// phone (inbox task 2026-11-13-102), the iOS counterpart of QrScanActivity.kt: the same
/// header (app/src/lib/qr-transfer.js: OD1~kind~transfer~index~total~crc~label~data), the same
/// panel (what is read, "N codes lus sur M", the segmented bar, the hint), the same texts from
/// the "options" the web layer passes. Minimal and untested (no Mac at the time of writing).
/// Calls `completion` once: nil when the diver closed it, else the raw texts of the codes.
final class QrScanController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    private struct Header {
        let kind: String
        let transfer: String
        let index: Int
        let total: Int
        let label: String
    }

    private let options: [String: Any]
    private let completion: ([String]?) -> Void
    private let session = AVCaptureSession()
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private let panel = UIView()
    private let kindLabel = UILabel()
    private let progressLabel = UILabel()
    private let bar = UIStackView()
    private let hintLabel = UILabel()
    private let permissionLabel = UILabel()
    private let permissionButton = UIButton(type: .system)

    private var transfer = ""
    private var kind = ""
    private var label = ""
    private var total = 0
    private var codes: [Int: String] = [:]
    private var ignored = Set<String>()
    private var asking = false
    private var finished = false

    init(options: [String: Any], completion: @escaping ([String]?) -> Void) {
        self.options = options
        self.completion = completion
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    private func text(_ key: String) -> String { options[key] as? String ?? "" }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.17, green: 0.18, blue: 0.2, alpha: 1)

        let close = UIButton(type: .system)
        close.setImage(UIImage(systemName: "xmark"), for: .normal)
        close.tintColor = .white
        close.accessibilityLabel = text("close")
        close.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
        let title = UILabel()
        title.text = text("title")
        title.textColor = .white
        title.font = .systemFont(ofSize: 22)
        title.accessibilityTraits = .header
        let top = UIStackView(arrangedSubviews: [close, title])
        top.spacing = 8
        top.alignment = .center
        top.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(top)

        panel.backgroundColor = UIColor(red: 0.07, green: 0.075, blue: 0.086, alpha: 0.82)
        panel.layer.cornerRadius = 24
        panel.translatesAutoresizingMaskIntoConstraints = false
        kindLabel.font = .systemFont(ofSize: 13)
        kindLabel.textColor = UIColor(white: 0.89, alpha: 1)
        progressLabel.font = .systemFont(ofSize: 20, weight: .semibold)
        progressLabel.textColor = .white
        bar.spacing = 4
        bar.distribution = .fillEqually
        bar.isAccessibilityElement = true
        bar.accessibilityLabel = text("progressBar")
        hintLabel.font = .systemFont(ofSize: 14)
        hintLabel.numberOfLines = 0
        let inner = UIStackView(arrangedSubviews: [kindLabel, progressLabel, bar, hintLabel])
        inner.axis = .vertical
        inner.spacing = 8
        inner.translatesAutoresizingMaskIntoConstraints = false
        panel.addSubview(inner)
        view.addSubview(panel)

        permissionLabel.textColor = .white
        permissionLabel.numberOfLines = 0
        permissionLabel.textAlignment = .center
        permissionLabel.font = .systemFont(ofSize: 16)
        permissionButton.setTitleColor(.white, for: .normal)
        permissionButton.isHidden = true
        permissionLabel.isHidden = true
        let permission = UIStackView(arrangedSubviews: [permissionLabel, permissionButton])
        permission.axis = .vertical
        permission.spacing = 16
        permission.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(permission)

        NSLayoutConstraint.activate([
            top.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 4),
            top.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 8),
            panel.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            panel.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
            panel.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -32),
            inner.topAnchor.constraint(equalTo: panel.topAnchor, constant: 20),
            inner.bottomAnchor.constraint(equalTo: panel.bottomAnchor, constant: -20),
            inner.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: 20),
            inner.trailingAnchor.constraint(equalTo: panel.trailingAnchor, constant: -20),
            bar.heightAnchor.constraint(equalToConstant: 6),
            permission.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            permission.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 32),
            permission.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -32),
        ])
        showProgress()
        checkPermission()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    // MARK: Permission and camera

    private func checkPermission() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: startCamera()
        case .notDetermined:
            permissionLabel.text = text("permissionReason")
            permissionLabel.isHidden = false
            permissionButton.setTitle(text("permissionButton"), for: .normal)
            permissionButton.isHidden = false
            permissionButton.removeTarget(nil, action: nil, for: .allEvents)
            permissionButton.addTarget(self, action: #selector(askPermission), for: .touchUpInside)
            panel.isHidden = true
        default: showDenied()
        }
    }

    @objc private func askPermission() {
        AVCaptureDevice.requestAccess(for: .video) { granted in
            DispatchQueue.main.async { granted ? self.startCamera() : self.showDenied() }
        }
    }

    private func showDenied() {
        panel.isHidden = true
        permissionLabel.text = "\(text("permissionDeniedTitle"))\n\n\(text("permissionDenied"))"
        permissionLabel.isHidden = false
        permissionButton.setTitle(text("permissionSettings"), for: .normal)
        permissionButton.isHidden = false
        permissionButton.removeTarget(nil, action: nil, for: .allEvents)
        permissionButton.addTarget(self, action: #selector(openSettings), for: .touchUpInside)
    }

    @objc private func openSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
    }

    private func startCamera() {
        permissionLabel.isHidden = true
        permissionButton.isHidden = true
        panel.isHidden = false
        guard let device = AVCaptureDevice.default(for: .video), let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) else {
            permissionLabel.text = text("cameraFailed")
            permissionLabel.isHidden = false
            panel.isHidden = true
            return
        }
        session.addInput(input)
        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else { return }
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        output.metadataObjectTypes = [.qr]
        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        layer.frame = view.bounds
        view.layer.insertSublayer(layer, at: 0)
        previewLayer = layer
        DispatchQueue.global(qos: .userInitiated).async { self.session.startRunning() }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        if session.isRunning { session.stopRunning() }
    }

    // MARK: Codes

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        for case let object as AVMetadataMachineReadableCodeObject in metadataObjects {
            if let value = object.stringValue { handle(value) }
        }
    }

    /// The same rules as parseChunk in qr-transfer.js.
    private func parseHeader(_ text: String) -> Header? {
        let parts = text.components(separatedBy: "~")
        guard parts.count == 8, parts[0] == "OD1", parts[1] == "d" || parts[1] == "p",
              parts[2].range(of: "^[0-9a-z]{6}$", options: .regularExpression) != nil,
              parts[5].range(of: "^[0-9a-f]{8}$", options: .regularExpression) != nil,
              let index = Int(parts[3]), let total = Int(parts[4]), index >= 1, total >= 1, index <= total, total <= 999,
              parts[6].range(of: "^[A-Za-z0-9_-]*$", options: .regularExpression) != nil,
              parts[7].range(of: "^[A-Za-z0-9_-]*$", options: .regularExpression) != nil
        else { return nil }
        var b64 = parts[6].replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        guard let data = Data(base64Encoded: b64), let label = String(data: data, encoding: .utf8) else { return nil }
        return Header(kind: parts[1], transfer: parts[2], index: index, total: total, label: label)
    }

    private func handle(_ value: String) {
        if finished || asking { return }
        guard value.hasPrefix("OD") else { return flash(text("foreign")) }
        guard let head = parseHeader(value) else {
            let magic = value.components(separatedBy: "~")[0]
            return flash(magic.range(of: "^OD\\d+$", options: .regularExpression) != nil && magic != "OD1" ? text("newerVersion") : text("foreign"))
        }
        if ignored.contains(head.transfer) { return }
        if transfer.isEmpty {
            begin(head)
        } else if head.transfer != transfer {
            ask(head, value)
            return
        }
        if head.total != total { return }
        if codes.updateValue(value, forKey: head.index) == nil { showProgress() }
        if codes.count == total {
            finished = true
            let list = (1...total).compactMap { codes[$0] }
            complete(list)
        }
    }

    private func begin(_ head: Header) {
        transfer = head.transfer
        kind = head.kind
        label = head.label
        total = head.total
    }

    private func ask(_ head: Header, _ value: String) {
        asking = true
        let alert = UIAlertController(title: text("otherTitle"), message: text("otherText"), preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: text("otherRestart"), style: .default) { _ in
            self.begin(head)
            self.codes.removeAll()
            self.asking = false
            self.handle(value)
        })
        alert.addAction(UIAlertAction(title: text("otherKeep"), style: .cancel) { _ in
            self.ignored.insert(head.transfer)
            self.asking = false
        })
        present(alert, animated: true)
    }

    // MARK: Panel

    private func showProgress() {
        hintLabel.textColor = UIColor(white: 0.89, alpha: 1)
        if total == 0 {
            kindLabel.isHidden = true
            progressLabel.isHidden = true
            bar.isHidden = true
            hintLabel.text = text("hintFirst")
            return
        }
        let name = kind == "p" ? text("kindPlan") : text("kindDive")
        kindLabel.isHidden = false
        kindLabel.text = label.isEmpty ? name : "\(name) · \(label)"
        progressLabel.isHidden = false
        progressLabel.text = text(codes.count == 1 ? "progressOne" : "progress")
            .replacingOccurrences(of: "{n}", with: String(codes.count))
            .replacingOccurrences(of: "{total}", with: String(total))
        bar.isHidden = false
        bar.arrangedSubviews.forEach { $0.removeFromSuperview() }
        for i in 1...total {
            let segment = UIView()
            segment.layer.cornerRadius = 3
            segment.backgroundColor = codes[i] != nil ? UIColor(red: 0.5, green: 0.82, blue: 0.51, alpha: 1) : UIColor(white: 1, alpha: 0.25)
            bar.addArrangedSubview(segment)
        }
        hintLabel.text = text("hint")
    }

    private func flash(_ message: String) {
        hintLabel.text = message
        hintLabel.textColor = UIColor(red: 1, green: 0.54, blue: 0.5, alpha: 1)
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            if let self, !self.finished { self.showProgress() }
        }
    }

    // MARK: Ending

    @objc private func closeTapped() { complete(nil) }

    private func complete(_ list: [String]?) {
        let done = completion
        dismiss(animated: true) { done(list) }
    }
}
