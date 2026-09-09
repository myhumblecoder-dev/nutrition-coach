import SwiftUI
import UIKit
import PhotosUI

/// Free conversation with the coach. Anything said here is also mined for
/// meals, training, sleep and caffeine by the server, so this doubles as the
/// logging surface — conversation is the only input.
///
/// A meal photo is part of that conversation rather than a separate feature,
/// which is why the camera lives in this composer and not on Today. It is the
/// same shape as the Telegram bot: send a picture, optionally say what it is,
/// and the coach tells you what it read before anything is logged. Whatever is
/// typed in the composer at the time travels with the photo as the hint.
struct ChatView: View {
    @Environment(AppState.self) private var state

    @State private var messages: [ChatMessage] = []
    @State private var draft = ""
    @State private var isSending = false
    @State private var error: String?
    @FocusState private var composerFocused: Bool
    @State private var reportingMessage: ChatMessage?
    @State private var reportConfirmation: String?

    @State private var isChoosingPhoto = false
    @State private var showingCamera = false
    @State private var isPickingFromLibrary = false
    @State private var libraryItem: PhotosPickerItem?
    @State private var pendingAnalysis: MealAnalysis?

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
            .confirmationDialog("Log a meal", isPresented: $isChoosingPhoto, titleVisibility: .visible) {
                // Only offered where it exists: the Simulator and any device
                // without a camera would otherwise get a button that presents
                // an empty screen.
                if CameraPicker.isAvailable {
                    Button("Take Photo") { showingCamera = true }
                }
                Button("Choose from Library") { isPickingFromLibrary = true }
                Button("Cancel", role: .cancel) {}
            }
            .photosPicker(isPresented: $isPickingFromLibrary, selection: $libraryItem, matching: .images)
            .fullScreenCover(isPresented: $showingCamera) {
                CameraPicker(
                    onPicked: { image in Task { await analyze(image) } },
                    onFinished: { showingCamera = false }
                )
                .ignoresSafeArea()
            }
            .sheet(item: $pendingAnalysis) { analysis in
                MealConfirmSheet(
                    analysis: analysis,
                    onLogged: { calories, protein in
                        await log(analysis, calories: calories, protein: protein)
                    },
                    onDiscarded: { await discard(analysis) }
                )
            }
            .onChange(of: libraryItem) { _, item in
                guard let item else { return }
                Task {
                    // Loaded as Data and re-decoded rather than asked for a
                    // UIImage: the picker hands back whatever the library
                    // holds, which on an iPhone is usually HEIC.
                    if let data = try? await item.loadTransferable(type: Data.self),
                       let image = UIImage(data: data) {
                        await analyze(image)
                    } else {
                        error = "Couldn't read that photo."
                    }
                    libraryItem = nil
                }
            }
        }
        .task { await load() }
    }

    private func bubble(for message: ChatMessage) -> some View {
        HStack(alignment: .bottom, spacing: 4) {
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
            // A visible handle beside every coach message. The context menu
            // still works, but a long-press nobody guesses at is not a usable
            // safety control — and Guideline 1.2 is only satisfied by one a
            // reviewer can actually find.
            if message.isFromCoach {
                Menu {
                    Button("Report", systemImage: "flag", role: .destructive) {
                        reportingMessage = message
                    }
                    Button("Copy", systemImage: "doc.on.doc") {
                        UIPasteboard.general.string = message.content
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.faint)
                        .frame(width: 28, height: 28)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Message options")
                Spacer(minLength: 12)
            }
        }
        .frame(maxWidth: .infinity, alignment: message.isFromCoach ? .leading : .trailing)
    }

    private var composer: some View {
        HStack(spacing: 8) {
            Button {
                composerFocused = false
                isChoosingPhoto = true
            } label: {
                Image(systemName: "camera.fill").font(.title3)
            }
            .disabled(isSending)
            .accessibilityLabel("Log a meal from a photo")

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

    /// Uploads a photo and shows what the coach read from it.
    ///
    /// The user bubble goes up first for the same reason it does in `send`:
    /// the vision round trip is slow, and a conversation that appears to stall
    /// reads as broken. The draft, if there is one, is the hint — so "chicken
    /// burrito bowl, no rice" plus a photo tells the model what the food is
    /// and leaves it to judge the portion.
    private func analyze(_ image: UIImage) async {
        error = nil

        guard let jpeg = MealImage.jpegForUpload(image) else {
            error = "Couldn't read that photo."
            return
        }

        let hint = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        draft = ""
        composerFocused = false

        isSending = true
        defer { isSending = false }

        messages.append(
            ChatMessage(
                id: "local-\(UUID().uuidString)",
                role: "user",
                content: hint.isEmpty ? "📷 Meal photo" : "📷 \(hint)",
                createdAt: Date()
            )
        )

        do {
            pendingAnalysis = try await state.client.analyzeMealPhoto(
                jpeg: jpeg, hint: hint.isEmpty ? nil : hint
            )
        } catch APIError.unauthorized {
            state.handleUnauthorized()
        } catch APIError.limitReached(let message) {
            // The server's own words. A cap is not a bad photo, and telling
            // someone to retake a picture that was fine sends them round a
            // loop.
            error = message
        } catch {
            self.error = "I couldn't read that as a meal photo — try a clearer, closer shot."
        }
    }

    private func log(_ analysis: MealAnalysis, calories: Int, protein: Int) async {
        do {
            try await state.client.confirmMeal(
                id: analysis.mealId, totalCalories: calories, totalProtein: protein
            )
            let foods = analysis.foodItems.map(\.name).joined(separator: ", ")
            messages.append(
                ChatMessage(
                    id: "local-\(UUID().uuidString)",
                    role: "assistant",
                    content: "Logged \(foods) — \(calories) cal, \(protein)g protein. ✓",
                    createdAt: Date()
                )
            )
        } catch APIError.unauthorized {
            state.handleUnauthorized()
        } catch {
            self.error = "Couldn't log that meal. Try again."
        }
    }

    private func discard(_ analysis: MealAnalysis) async {
        // Failure is swallowed on purpose. The meal is pending, so it counts
        // towards nothing either way; nagging about a discard that did not
        // land would be noise about a decision already made.
        try? await state.client.discardMeal(id: analysis.mealId)
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
