import UIKit
import Capacitor
import WebKit

class CustomBridgeViewController: CAPBridgeViewController {

    override var canBecomeFirstResponder: Bool {
        return true
    }

    override func becomeFirstResponder() -> Bool {
        // Asegurar que la ventana sea clave
        if let window = self.view.window, !window.isKeyWindow {
            window.makeKeyAndVisible()
        }
        // Intentar que el webView sea first responder
        if let webView = self.webView {
            if webView.becomeFirstResponder() {
                return true
            }
        }
        return super.becomeFirstResponder()
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        super.touchesBegan(touches, with: event)
        // Forzar que la ventana sea clave y el webView first responder
        if let window = self.view.window, !window.isKeyWindow {
            window.makeKeyAndVisible()
        }
        if let webView = self.webView, !webView.isFirstResponder {
            webView.becomeFirstResponder()
        }
        // También asegurar que el controlador mismo sea first responder
        if !self.isFirstResponder {
            self.becomeFirstResponder()
        }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        super.touchesEnded(touches, with: event)
        // Reforzar al final del toque
        if let window = self.view.window, !window.isKeyWindow {
            window.makeKeyAndVisible()
        }
        if let webView = self.webView, !webView.isFirstResponder {
            webView.becomeFirstResponder()
        }
    }
}
