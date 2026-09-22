import UIKit

/// Checksmith is a single self-contained HTML file. The app is only a shell
/// around it: one window, one web view, no navigation and no network.
@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions:
                        [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = GameViewController()
        window.backgroundColor = UIColor(red: 0.078, green: 0.082, blue: 0.102, alpha: 1)
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}
