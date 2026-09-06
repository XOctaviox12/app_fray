import UIKit
import Capacitor
import WebKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    weak var webView: WKWebView?
    private var keepAliveTimer: Timer?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        // Ignorar escenas externas (Apple TV)
        if session.role != .windowApplication {
            return
        }

        guard let windowScene = scene as? UIWindowScene else { return }

        let bridgeViewController = CustomBridgeViewController()
        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = bridgeViewController
        window?.makeKeyAndVisible()
        window?.setNeedsLayout()
        window?.layoutIfNeeded()

        // Aumentar el retraso para dar tiempo a que el WebView cargue completamente
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            if let wv = bridgeViewController.webView {
                self.webView = wv
                self.startKeepAlive()
                // Forzar first responder con un retraso adicional
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    self.forceWebViewFirstResponder()
                }
            }
        }

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(applicationDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
    }

    @objc func applicationDidBecomeActive() {
        DispatchQueue.main.async {
            self.forceWebViewFirstResponder()
            self.startKeepAlive()
        }
    }

    func forceWebViewFirstResponder() {
        guard let webView = self.webView else { return }
        if self.window?.isKeyWindow != true {
            self.window?.makeKeyAndVisible()
        }
        if !webView.becomeFirstResponder() {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                webView.becomeFirstResponder()
            }
        }
    }

    // Keep-alive nativo con intervalo más corto
    func startKeepAlive() {
        stopKeepAlive()
        keepAliveTimer = Timer.scheduledTimer(withTimeInterval: 0.15, repeats: true) { [weak self] _ in
            guard let webView = self?.webView else { return }
            webView.evaluateJavaScript("true") { (_, _) in }
        }
    }

    func stopKeepAlive() {
        keepAliveTimer?.invalidate()
        keepAliveTimer = nil
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        stopKeepAlive()
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        startKeepAlive()
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) { }
    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) { }
}
