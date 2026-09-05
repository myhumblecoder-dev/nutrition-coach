import SwiftUI
import AuthenticationServices

struct SignInView: View {
    @Environment(AppState.self) private var state

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            VStack(spacing: 8) {
                Text("Roughly")
                    .font(.largeTitle.weight(.semibold))
                Text("Stop counting. The labels are guessing too.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            Spacer()

            SignInWithAppleButton(.signIn) { request in
                // Email is requested because the backend links a first-time
                // iOS sign-in to an existing web account by verified email.
                request.requestedScopes = [.email]
            } onCompletion: { result in
                handle(result)
            }
            .signInWithAppleButtonStyle(.black)
            .frame(height: 50)
            .accessibilityIdentifier("signInWithApple")

            if let error = state.signInError {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
        }
        .padding(32)
    }

    private func handle(_ result: Result<ASAuthorization, Error>) {
        guard
            case .success(let authorization) = result,
            let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
            let data = credential.identityToken,
            let token = String(data: data, encoding: .utf8)
        else { return }

        Task { await state.signIn(identityToken: token) }
    }
}
