import SwiftUI

/// The product's core surface: one question at a time, answered in the user's
/// own words. No numbers are requested and none are shown.
struct CheckInView: View {
    @Environment(AppState.self) private var state

    @State private var question: String?
    @State private var draft = ""
    @State private var coachReply: String?
    @State private var isComplete = false
    @State private var isLoading = true
    @State private var isSending = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView()
                } else if isComplete {
                    completed
                } else {
                    conversation
                }
            }
            .padding()
            .navigationTitle("This week")
        }
        .task { await load() }
    }

    private var completed: some View {
        VStack(spacing: 12) {
            Image(systemName: "checkmark.circle")
                .font(.system(size: 44))
                .foregroundStyle(.green)
            Text("That's this week's check-in.")
                .font(.headline)
            Text("I'll ask again next week.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private var conversation: some View {
        VStack(alignment: .leading, spacing: 20) {
            if let coachReply {
                Text(coachReply)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .transition(.opacity)
            }

            if let question {
                Text(question)
                    .font(.title3.weight(.medium))
            }

            // Free text, never a picker: a fixed set of options would be the
            // app deciding what counts as an answer.
            TextField("In your own words…", text: $draft, axis: .vertical)
                .lineLimit(3...6)
                .textFieldStyle(.roundedBorder)
                .disabled(isSending)

            Button {
                Task { await submit() }
            } label: {
                if isSending {
                    ProgressView()
                } else {
                    Text("Send").frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSending)

            if let error {
                Text(error).font(.footnote).foregroundStyle(.red)
            }

            Spacer()
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let response = try await state.client.checkIns()
            question = response.current.nextQuestion
            isComplete = response.current.complete
        } catch APIError.unauthorized {
            state.handleUnauthorized()
        } catch {
            self.error = "Couldn't load this week's check-in."
        }
    }

    private func submit() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        isSending = true
        defer { isSending = false }
        error = nil

        do {
            let result = try await state.client.answerCheckIn(text)
            draft = ""
            withAnimation {
                coachReply = result.reply
                question = result.nextQuestion
                isComplete = result.complete
            }
        } catch APIError.unauthorized {
            state.handleUnauthorized()
        } catch {
            self.error = "Couldn't save that. Try again."
        }
    }
}
