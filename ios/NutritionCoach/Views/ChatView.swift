import SwiftUI
import UIKit

/// Free conversation with the coach. Anything said here is also mined for
/// meals, training, sleep and caffeine by the server, so this doubles as the
/// logging surface — conversation is the only input.
struct ChatView: View {
    @Environment(AppState.self) private var state

    @State private var messages: [ChatMessage] = []
    @State private var draft = ""
    @State private var isSending = false
    @State private var error: String?
    @FocusState private var composerFocused: Bool
    @State private var reportingMessage: ChatMessage?
    @State private var reportConfirmation: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            ForEach(messages) { message in
                                bubble(for: message).id(message.id)
                            }
                        }
                        .padding()
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .onChange(of: messages.count) {
                        guard let last = messages.last else { return }
                        withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                    }
                }

                if let error {
                    Text(error).font(.footnote).foregroundStyle(.red).padding(.horizontal)
                }

                composer
            }
            .navigationTitle("Coach")
            .confirmationDialog(
                "Report this reply?",
                isPresented: .init(
                    get: { reportingMessage != nil },
                    set: { if !$0 { reportingMessage = nil } }
                ),
                titleVisibility: .visible
            ) {
                Button("Report", role: .destructive) {
                    if let message = reportingMessage { Task { await report(message) } }
                }
                Button("Cancel", role: .cancel) { reportingMessage = nil }
            } message: {
                Text("The coach is generated, and sometimes it gets things wrong. Reporting sends this reply to us to look at.")
            }
            .alert(
                reportConfirmation ?? "",
                isPresented: .init(
                    get: { reportConfirmation != nil },
                    set: { if !$0 { reportConfirmation = nil } }
                )
            ) {
                Button("OK", role: .cancel) { reportConfirmation = nil }
            }
        }
        .task { await load() }
    }

    private func bubble(for message: ChatMessage) -> some View {
        HStack {
            if !message.isFromCoach { Spacer(minLength: 40) }
            Text(message.content)
                .padding(10)
                .background(message.isFromCoach ? Color(.secondarySystemBackground) : Color.accentColor)
                .foregroundStyle(message.isFromCoach ? Color.primary : Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                // Only the coach's words can be reported: reporting your own
                // message would be reporting yourself, and the thing worth
                // flagging is what the model said.
                .contextMenu {
                    if message.isFromCoach {
                        Button("Report", systemImage: "flag", role: .destructive) {
                            reportingMessage = message
                        }
                        Button("Copy", systemImage: "doc.on.doc") {
                            UIPasteboard.general.string = message.content
                        }
                    }
                }
            if message.isFromCoach { Spacer(minLength: 40) }
        }
        .frame(maxWidth: .infinity, alignment: message.isFromCoach ? .leading : .trailing)
    }

    private var composer: some View {
        HStack(spacing: 8) {
            TextField("Tell the coach about your day…", text: $draft, axis: .vertical)
                .lineLimit(1...4)
                .textFieldStyle(.roundedBorder)
                .disabled(isSending)
                .focused($composerFocused)

            Button {
                Task { await send() }
            } label: {
                Image(systemName: "arrow.up.circle.fill").font(.title2)
            }
            .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSending)
        }
        .padding()
    }

    private func report(_ message: ChatMessage) async {
        reportingMessage = nil
        do {
            try await state.client.reportMessage(message.content, messageId: message.id)
            reportConfirmation = "Reported. Thank you — we'll take a look."
        } catch APIError.unauthorized {
            state.handleUnauthorized()
        } catch {
            reportConfirmation = "Couldn't send that report. Please try again."
        }
    }

    private func load() async {
        do {
            messages = try await state.client.chatHistory()
        } catch APIError.unauthorized {
            state.handleUnauthorized()
        } catch {
            self.error = "Couldn't load the conversation."
        }
    }

    private func send() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        isSending = true
        defer { isSending = false }
        error = nil
        draft = ""
        // Sending ends the turn. Holding focus here kept the keyboard up over
        // the tab bar, with no way back to Today or Settings.
        composerFocused = false

        // Shown immediately so the conversation does not appear to stall
        // during the LLM round trip; the id is replaced when history reloads.
        messages.append(
            ChatMessage(id: "local-\(UUID().uuidString)", role: "user", content: text, createdAt: Date())
        )

        do {
            let reply = try await state.client.sendMessage(text)
            messages.append(
                ChatMessage(id: "local-\(UUID().uuidString)", role: "assistant", content: reply, createdAt: Date())
            )
        } catch APIError.unauthorized {
            state.handleUnauthorized()
        } catch {
            self.error = "Couldn't send that. Try again."
        }
    }
}
