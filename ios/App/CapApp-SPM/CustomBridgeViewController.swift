import UIKit
import Capacitor
import WebKit

class CustomBridgeViewController: CAPBridgeViewController {

    override var canBecomeFirstResponder: Bool {
        return true
    }

    override func becomeFirstResponder() -> Bool {
        if let webView = self.webView {
            if webView.becomeFirstResponder() {
                return true
            }
        }
        return super.becomeFirstResponder()
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        super.touchesBegan(touches, with: event)
        if let webView = self.webView, !webView.isFirstResponder {
            webView.becomeFirstResponder()
        }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        super.touchesEnded(touches, with: event)
        if let webView = self.webView, !webView.isFirstResponder {
            webView.becomeFirstResponder()
        }
    }
}
