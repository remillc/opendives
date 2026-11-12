// SPDX-License-Identifier: GPL-2.0
import Foundation
import UIKit
import WebKit

/// A page of HTML rendered to PDF data by an offscreen WKWebView, without network
/// or dialog (the counterpart of the Android print engine). Main thread only; the
/// owner keeps the renderer alive until `completion` is called, once, with nil on
/// failure.
///
/// WebKit ignores @page, so the layout is done at the paper's width in CSS pixels
/// (96 per inch) with the margins of the dive sheets added to the body: the
/// PDF page is that many points wide, with the proportions of A4 or US Letter.
/// A sheet longer than a page gives one taller page.
final class HtmlPdfRenderer: NSObject, WKNavigationDelegate {
    private let webView: WKWebView
    private let paper: CGSize
    private var completion: ((Data?) -> Void)?

    init(html: String, letter: Bool, completion: @escaping (Data?) -> Void) {
        let size = letter ? CGSize(width: 816, height: 1056) : CGSize(width: 794, height: 1123)
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = false
        paper = size
        webView = WKWebView(frame: CGRect(origin: .zero, size: size), configuration: configuration)
        self.completion = completion
        super.init()
        webView.navigationDelegate = self
        let head = "<meta name=\"viewport\" content=\"width=\(Int(size.width))\">"
            + "<style>body { padding: 14mm 14mm 16mm; }</style></head>"
        var page = html
        if let range = page.range(of: "</head>") {
            page.replaceSubrange(range, with: head)
        }
        webView.loadHTMLString(page, baseURL: nil)
        DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self] in self?.finish(nil) }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // The app's own script runs even with the page's scripts off.
        webView.evaluateJavaScript("document.documentElement.scrollHeight") { [self] value, _ in
            let content = CGFloat((value as? NSNumber)?.doubleValue ?? 0)
            let configuration = WKPDFConfiguration()
            configuration.rect = CGRect(x: 0, y: 0, width: paper.width, height: max(content, paper.height))
            webView.createPDF(configuration: configuration) { [self] result in
                switch result {
                case .success(let data): finish(data)
                case .failure: finish(nil)
                }
            }
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        finish(nil)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        finish(nil)
    }

    private func finish(_ data: Data?) {
        guard let done = completion else { return }
        completion = nil
        webView.navigationDelegate = nil
        done(data)
    }
}
