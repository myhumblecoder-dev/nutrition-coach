import SwiftUI

struct RootView: View {
    @Environment(AppState.self) private var state

    /// Always 0 in a Release build. A screenshot run overrides it per launch
    /// so each tab can be captured without driving the UI.
    @State private var tab = RootView.initialTab

    private static var initialTab: Int {
        #if DEBUG
        DemoMode.initialTab
        #else
        0
        #endif
    }

    var body: some View {
        if state.isSignedIn {
            TabView(selection: $tab) {
                // The weekly check-in leads: it is the product, not a feature.
                CheckInView()
                    .tabItem { Label("This week", systemImage: "calendar.badge.clock") }
                    .tag(0)
                ChatView()
                    .tabItem { Label("Coach", systemImage: "bubble.left.and.bubble.right") }
                    .tag(1)
                ReviewView()
                    .tabItem { Label("Review", systemImage: "list.bullet.rectangle") }
                    .tag(2)
                SettingsView()
                    .tabItem { Label("Settings", systemImage: "gearshape") }
                    .tag(3)
            }
        } else {
            SignInView()
        }
    }
}
