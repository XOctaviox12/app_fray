import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        if UIDevice.current.userInterfaceIdiom == .pad {
            return .landscape
        } else {
            return .portrait
        }
    }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            self.forceMainWindowToBeKey()
        }
        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        DispatchQueue.main.async {
            self.forceMainWindowToBeKey()
        }
    }

    func application(_ application: UIApplication, didConnect screen: UIScreen) {
        // Reforzar la ventana clave cuando se conecta una pantalla externa
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            self.forceMainWindowToBeKey()
        }
    }

    func application(_ application: UIApplication, didDisconnect screen: UIScreen) {
        DispatchQueue.main.async {
            self.forceMainWindowToBeKey()
        }
    }

    func forceMainWindowToBeKey() {
        if let windowScene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.session.role == .windowApplication }) {
            if let mainWindow = windowScene.windows.first {
                mainWindow.makeKeyAndVisible()
            }
        }
    }

    func applicationWillResignActive(_ application: UIApplication) { }
    func applicationDidEnterBackground(_ application: UIApplication) { }
    func applicationWillEnterForeground(_ application: UIApplication) { }
    func applicationWillTerminate(_ application: UIApplication) { }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
