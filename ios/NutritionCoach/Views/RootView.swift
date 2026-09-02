import SwiftUI

struct RootView: View {
    @Environment(AppState.self) private var state

    var body: some View {
        if state.isSignedIn {
            TabView {
                // The weekly check-in leads: it is the product, not a feature.
                CheckInView()
                    .tabItem { Label("This week", systemImage: "calendar.badge.clock") }
                ChatView()
                    .tabItem { Label("Coach", systemImage: "bubble.left.and.bubble.right") }
                ReviewView()
                    .tabItem { Label("Review", systemImage: "list.bullet.rectangle") }
                SettingsView()
                    .tabItem { Label("Settings", systemImage: "gearshape") }
            }
        } else {
            SignInView()
        }
    }
}
