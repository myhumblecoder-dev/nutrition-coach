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
            // Today / Chat / Settings, matching the web nav exactly. The
            // weekly check-in is not a screen on either client: it arrives as
            // a coach message from the cron job and is answered in the
            // conversation, like everything else.
            TabView(selection: $tab) {
                TodayView(selectedTab: $tab)
                    .tabItem { Label("Today", systemImage: "house") }
                    .tag(0)
                ChatView()
                    .tabItem { Label("Chat", systemImage: "bubble.left.and.bubble.right") }
                    .tag(1)
                SettingsView()
                    .tabItem { Label("Settings", systemImage: "gearshape") }
                    .tag(2)
            }
        } else {
            SignInView()
        }
    }
}
