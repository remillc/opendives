// SPDX-License-Identifier: GPL-2.0
import UIKit
import WebKit
import Capacitor

/// The launch screen stays until the web layer has drawn the first screen
/// (OpenDivesCore.contentShown), so that no blank WebView shows between the
/// two, as on Android (SplashGate). Never longer than `limit`. Main thread only.
enum LaunchCover {
    /// The launch screen is never kept longer than this, whatever the web layer does.
    static let limit: TimeInterval = 4
    private static var cover: UIView?

    /// Puts a copy of the launch screen over the app's view, and gives the
    /// WebView the launch screen's background until the page paints.
    static func show(over view: UIView?, webView: WKWebView?, attempt: Int = 0, viewProvider: @escaping () -> UIView? = { nil }) {
        if let background = UIColor(named: "SplashBackground") {
            webView?.isOpaque = false
            webView?.backgroundColor = background
            webView?.scrollView.backgroundColor = background
        }
        guard cover == nil else { return }
        guard let view else {
            // The bridge's view controller may not exist yet: try again shortly.
            CAPLog.print("LaunchCover: no view yet (try \(attempt))")
            if attempt < 50 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.02) { show(over: viewProvider(), webView: webView, attempt: attempt + 1, viewProvider: viewProvider) }
            }
            return
        }
        guard let launch = UIStoryboard(name: "LaunchScreen", bundle: .main).instantiateInitialViewController()?.view else {
            CAPLog.print("LaunchCover: the launch storyboard did not load")
            return
        }
        // Diagnostic: the logo's image, as the copy of the launch screen holds it.
        let logo = launch.subviews.compactMap { $0 as? UIImageView }.first
        CAPLog.print("LaunchCover: asset Splash \(UIImage(named: "Splash") != nil ? "found" : "missing"), imageView \(logo == nil ? "missing" : "present"), its image \(logo?.image == nil ? "nil" : "set")")
        if logo?.image == nil { logo?.image = UIImage(named: "Splash") }
        launch.frame = view.bounds
        launch.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(launch)
        cover = launch
        DispatchQueue.main.asyncAfter(deadline: .now() + limit) { hide(force: false) }
    }

    /// Tests only: the launch screen is kept 8 s so that a screenshot can catch it.
    private static let held = ProcessInfo.processInfo.environment["OD_HOLD_LAUNCH_SCREEN"] != nil

    static func hide(force: Bool = false) {
        if held && !force { DispatchQueue.main.asyncAfter(deadline: .now() + 8) { hide(force: true) }; return }
        guard let launch = cover else { return }
        cover = nil
        UIView.animate(withDuration: 0.2, animations: { launch.alpha = 0 }, completion: { _ in launch.removeFromSuperview() })
    }
}
