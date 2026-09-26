import UIKit
import WebKit

/// Hosts the bundled page and nothing else.
///
/// The page draws its own safe-area padding through `env(safe-area-inset-*)`,
/// so the web view is deliberately given the full screen rather than the safe
/// area: letting the page decide keeps the board centred and the background
/// running edge to edge behind the notch and the home indicator.
final class GameViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {

    private var web: WKWebView!

    private static let pageName = "index"

    override func loadView() {
        let config = WKWebViewConfiguration()
        // The forge sounds are synthesised on the first tap; that tap is the
        // user gesture, so nothing has to be pre-authorised beyond this.
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.suppressesIncrementalRendering = false
        config.defaultWebpagePreferences.allowsContentJavaScript = true

        // The board is a fixed layout. Double-tap and pinch zoom would only
        // ever fight it, and the page sets its own viewport.
        let noZoom = """
        var m = document.querySelector('meta[name=viewport]');
        if (m) { m.setAttribute('content',
          'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'); }
        """
        config.userContentController.addUserScript(
            WKUserScript(source: noZoom, injectionTime: .atDocumentEnd, forMainFrameOnly: true))

        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 0.078, green: 0.082, blue: 0.102, alpha: 1)
        web.scrollView.backgroundColor = web.backgroundColor
        web.scrollView.bounces = false                 // no rubber-banding past the page
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.scrollView.showsVerticalScrollIndicator = false
        web.scrollView.showsHorizontalScrollIndicator = false
        web.allowsBackForwardNavigationGestures = false
        web.allowsLinkPreview = false
        view = web
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        // A puzzle with no timer invites long pauses for thinking; don't let
        // the screen drop out mid-plan.
        UIApplication.shared.isIdleTimerDisabled = true
        watchAppState()
        loadGame()
    }

    /// Sending the app away has to silence the music, and WKWebView will not
    /// always report that to the page as a visibility change - a call answered
    /// mid-round is the usual way through. The app's own lifecycle is the
    /// reliable signal, so it is passed straight to the page.
    private func watchAppState() {
        let centre = NotificationCenter.default
        centre.addObserver(self,
                           selector: #selector(appWentAway),
                           name: UIApplication.willResignActiveNotification,
                           object: nil)
        centre.addObserver(self,
                           selector: #selector(appCameBack),
                           name: UIApplication.didBecomeActiveNotification,
                           object: nil)
    }

    @objc private func appWentAway() {
        web?.evaluateJavaScript("window.checksmithPause && window.checksmithPause();")
    }

    @objc private func appCameBack() {
        web?.evaluateJavaScript("window.checksmithResume && window.checksmithResume();")
    }

    private func loadGame() {
        guard let url = Bundle.main.url(forResource: Self.pageName, withExtension: "html") else {
            assertionFailure("index.html is missing from the bundle")
            return
        }
        web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
    }

    /// Only the bundled page may load in here. Anything else is a mistake or an
    /// injected link; hand it to the system browser or refuse it outright.
    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if url.isFileURL && url.lastPathComponent == "\(Self.pageName).html" {
            decisionHandler(.allow)
            return
        }
        if navigationAction.navigationType == .linkActivated,
           url.scheme == "http" || url.scheme == "https" {
            UIApplication.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    // The page is a fixed dark layout; keep the status bar legible over it.
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
    override var prefersHomeIndicatorAutoHidden: Bool { false }

    deinit {
        NotificationCenter.default.removeObserver(self)
        UIApplication.shared.isIdleTimerDisabled = false
    }
}
