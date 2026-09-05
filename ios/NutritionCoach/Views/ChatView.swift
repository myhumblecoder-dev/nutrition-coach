import SwiftUI

/// Free conversation with the coach. Anything said here is also mined for
/// meals, training, sleep and caffeine by the server, so this doubles as the
/// logging surface — conversation is the only input.
struct ChatView: View {
    @Environment(AppState.self) private var state

    @State private var messages: [ChatMessage] = []
    @State private var draft = ""
    @State private var isSending = false
    @State private var error: String?

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

            Button {
                Task { await send() }
            } label: {
                Image(systemName: "arrow.up.circle.fill").font(.title2)
            }
            .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSending)
        }
        .padding()
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
