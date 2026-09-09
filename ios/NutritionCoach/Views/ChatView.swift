import SwiftUI
import UIKit
import PhotosUI

/// One turn in the conversation.
///
/// The thread is no longer just server messages: a meal photo and the coach's
/// read on it are turns too, and they exist only on the device until the meal
/// is logged. Modelling them as cases here rather than faking them as
/// `ChatMessage`s keeps the photo an image and the pending meal interactive.
enum ChatItem: Identifiable {
    case message(ChatMessage)
    case photo(SentPhoto)
    case pending(MealAnalysis)

    var id: String {
        switch self {
        case .message(let message): return "m-\(message.id)"
        case .photo(let photo): return "p-\(photo.id)"
        // The meal id, so a correction updates the card in place instead of
        // stacking a second one underneath.
        case .pending(let analysis): return "pending-\(analysis.mealId)"
        }
    }
}

/// A photo the user sent, held locally so it can be shown at full fidelity
/// without waiting on the blob round trip.
struct SentPhoto: Identifiable {
    let id = UUID().uuidString
    let image: UIImage
    let caption: String
}

/// Free conversation with the coach. Anything said here is also mined for
/// meals, training, sleep and caffeine by the server, so this doubles as the
/// logging surface — conversation is the only input.
///
/// A meal photo is part of that conversation, not a feature beside it. It is
/// attached in the composer and captioned before it is sent, the way any
/// messaging app handles a picture; the coach answers in the thread with what
/// it read and two buttons. Disagreeing is just talking: while a meal is
/// pending, what you type corrects it rather than starting a new subject.
struct ChatView: View {
    @Environment(AppState.self) private var state

    @State private var items: [ChatItem] = []
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
    /// Staged in the composer, not yet uploaded — this is the window in which
    /// a caption can be written.
    @State private var attached: UIImage?
    /// While set, the composer corrects this meal instead of saying something
    /// new.
    @State private var pendingMealId: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                thread

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
                    onPicked: { attach($0) },
                    onFinished: { showingCamera = false }
                )
                .ignoresSafeArea()
            }
            .onChange(of: libraryItem) { _, item in
                guard let item else { return }
                Task {
                    // Loaded as Data and re-decoded rather than asked for a
                    // UIImage: the picker hands back whatever the library
                    // holds, which on an iPhone is usually HEIC.
                    if let data = try? await item.loadTransferable(type: Data.self),
                       let image = UIImage(data: data) {
                        attach(image)
                    } else {
                        error = "Couldn't read that photo."
                    }
                    libraryItem = nil
                }
            }
        }
        .task {
            await load()
            #if DEBUG
            // Drives the real attach-and-send path against DemoTransport's
            // fixture, so the composer's attachment strip and the pending card
            // can be inspected on a Simulator with no camera. Inert without
            // the launch argument, and absent from a Release binary.
            if DemoMode.sendsAMealPhoto {
                attach(DemoMode.stubMealPhoto())
                draft = "chicken burrito bowl, no rice"
                await sendPhoto()

                if DemoMode.correctsTheMeal, let id = pendingMealId {
                    draft = "that was a double portion"
                    await correct(id)
                }
                if DemoMode.logsTheMeal,
                   case .pending(let analysis)? = items.last {
                    await log(analysis, calories: analysis.totalCalories, protein: analysis.totalProtein)
                }
            }
            #endif
        }
    }

    // MARK: - Thread

    private var thread: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    ForEach(items) { item in
                        row(for: item).id(item.id)
                    }
                }
                .padding()
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: items.map(\.id).joined()) {
                guard let last = items.last else { return }
                withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
            }
        }
    }

    @ViewBuilder
    private func row(for item: ChatItem) -> some View {
        switch item {
        case .message(let message):
            bubble(for: message)
        case .photo(let photo):
            photoBubble(photo)
        case .pending(let analysis):
            PendingMealCard(
                analysis: analysis,
                isBusy: isSending,
                onLog: { calories, protein in
                    Task { await log(analysis, calories: calories, protein: protein) }
                },
                onDiscard: { Task { await discard(analysis) } }
            )
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// The photo as sent, with its caption underneath in the same bubble — so
    /// the words and the picture read as one turn, which is what they were.
    private func photoBubble(_ photo: SentPhoto) -> some View {
        HStack {
            Spacer(minLength: 40)
            VStack(alignment: .trailing, spacing: 0) {
                Image(uiImage: photo.image)
                    .resizable()
                    .scaledToFill()
                    .frame(maxWidth: 220, maxHeight: 220)
                    .clipped()

                if !photo.caption.isEmpty {
                    Text(photo.caption)
                        .font(.body)
                        .foregroundStyle(.white)
                        .padding(10)
                        .frame(maxWidth: 220, alignment: .leading)
                }
            }
            .background(Color.accentColor)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
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

    // MARK: - Composer

    private var composer: some View {
        VStack(spacing: 8) {
            if let attached { attachmentStrip(attached) }
            if attached == nil, pendingMealId != nil { correctingStrip }

            HStack(spacing: 8) {
                Button {
                    composerFocused = false
                    isChoosingPhoto = true
                } label: {
                    Image(systemName: "camera.fill").font(.title3)
                }
                .disabled(isSending || attached != nil)
                .accessibilityLabel("Log a meal from a photo")

                TextField(composerPrompt, text: $draft, axis: .vertical)
                    .lineLimit(1...4)
                    .textFieldStyle(.roundedBorder)
                    .disabled(isSending)
                    .focused($composerFocused)

                Button {
                    Task { await sendComposer() }
                } label: {
                    Image(systemName: "arrow.up.circle.fill").font(.title2)
                }
                .disabled(!canSend)
            }
        }
        .padding()
    }

    private var composerPrompt: String {
        if attached != nil { return "Add a caption…" }
        if pendingMealId != nil { return "Tell me what I got wrong…" }
        return "Tell the coach about your day…"
    }

    /// A photo with no caption is still worth sending — the caption is help,
    /// not a requirement. Text alone is only sendable when it is not empty.
    private var canSend: Bool {
        guard !isSending else { return false }
        if attached != nil { return true }
        return !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func attachmentStrip(_ image: UIImage) -> some View {
        HStack(spacing: 10) {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: 44, height: 44)
                .clipShape(RoundedRectangle(cornerRadius: 8))

            Text("Say what it is, if you like — I'll judge the portion.")
                .font(.caption)
                .foregroundStyle(Theme.muted)

            Spacer(minLength: 0)

            Button {
                attached = nil
            } label: {
                Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.faint)
            }
            .accessibilityLabel("Remove photo")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Says plainly that typing will correct the meal rather than change the
    /// subject, and offers the way out. Routing text somewhere unexpected with
    /// no sign it was happening would be worse than having no correction at all.
    private var correctingStrip: some View {
        HStack(spacing: 8) {
            Image(systemName: "arrow.uturn.backward")
                .font(.caption)
                .foregroundStyle(Theme.accentInk)
            Text("Correcting the meal above")
                .font(.caption)
                .foregroundStyle(Theme.accentInk)
            Spacer(minLength: 0)
            Button("Done") { pendingMealId = nil }
                .font(.caption.weight(.semibold))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Theme.accentWash)
        .clipShape(Capsule())
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Actions

    private func attach(_ image: UIImage) {
        showingCamera = false
        error = nil
        attached = image
        // Focus follows the photo: the caption is the point of this step, and
        // a keyboard the user has to summon is a step most people skip.
        composerFocused = true
    }

    /// One send button, three meanings, decided by what is on screen.
    private func sendComposer() async {
        if attached != nil {
            await sendPhoto()
        } else if let mealId = pendingMealId {
            await correct(mealId)
        } else {
            await send()
        }
    }

    private func load() async {
        do {
            items = try await state.client.chatHistory().map(ChatItem.message)
        } catch APIError.unauthorized {
            state.handleUnauthorized()
        } catch {
            self.error = "Couldn't load the conversation."
        }
    }

    private func sendPhoto() async {
        guard let image = attached else { return }
        error = nil

        guard let jpeg = MealImage.jpegForUpload(image) else {
            error = "Couldn't read that photo."
            return
        }

        let caption = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        draft = ""
        attached = nil
        composerFocused = false

        isSending = true
        defer { isSending = false }

        items.append(.photo(SentPhoto(image: image, caption: caption)))

        do {
            let analysis = try await state.client.analyzeMealPhoto(
                jpeg: jpeg, hint: caption.isEmpty ? nil : caption
            )
            items.append(.pending(analysis))
            pendingMealId = analysis.mealId
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

    /// Re-reads the photo in light of what the user just said about it.
    private func correct(_ mealId: String) async {
        let words = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !words.isEmpty else { return }

        error = nil
        draft = ""
        composerFocused = false

        isSending = true
        defer { isSending = false }

        items.append(
            .message(ChatMessage(id: "local-\(UUID().uuidString)", role: "user", content: words, createdAt: Date()))
        )

        do {
            let revised = try await state.client.reviseMeal(id: mealId, correction: words)
            // Replaced in place, so the thread shows one current answer rather
            // than a pile of superseded ones.
            if let index = items.firstIndex(where: { $0.id == "pending-\(mealId)" }) {
                items.remove(at: index)
            }
            items.append(.pending(revised))
        } catch APIError.unauthorized {
            state.handleUnauthorized()
        } catch APIError.limitReached(let message) {
            error = message
        } catch APIError.badStatus(404) {
            pendingMealId = nil
            error = "That meal's no longer pending."
        } catch {
            self.error = "I couldn't make sense of that one — try telling me another way."
        }
    }

    private func log(_ analysis: MealAnalysis, calories: Int, protein: Int) async {
        error = nil
        isSending = true
        defer { isSending = false }

        do {
            try await state.client.confirmMeal(
                id: analysis.mealId, totalCalories: calories, totalProtein: protein
            )
            replacePending(
                analysis,
                with: "Logged \(analysis.foodItems.map(\.name).joined(separator: ", ")) — \(calories) cal, \(protein)g protein. ✓"
            )
        } catch APIError.unauthorized {
            state.handleUnauthorized()
        } catch {
            self.error = "Couldn't log that meal. Try again."
        }
    }

    private func discard(_ analysis: MealAnalysis) async {
        error = nil
        // Failure is swallowed on purpose. The meal is pending, so it counts
        // towards nothing either way; nagging about a discard that did not
        // land would be noise about a decision already made.
        try? await state.client.discardMeal(id: analysis.mealId)
        replacePending(analysis, with: "Dropped it. Tell me or show me again if you want it logged differently.")
    }

    /// Swaps the interactive card for the coach's plain word on the outcome,
    /// so a settled meal cannot be logged twice from a stale card.
    private func replacePending(_ analysis: MealAnalysis, with reply: String) {
        items.removeAll { $0.id == "pending-\(analysis.mealId)" }
        items.append(
            .message(ChatMessage(id: "local-\(UUID().uuidString)", role: "assistant", content: reply, createdAt: Date()))
        )
        if pendingMealId == analysis.mealId { pendingMealId = nil }
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
        items.append(
            .message(ChatMessage(id: "local-\(UUID().uuidString)", role: "user", content: text, createdAt: Date()))
        )

        do {
            let reply = try await state.client.sendMessage(text)
            items.append(
                .message(ChatMessage(id: "local-\(UUID().uuidString)", role: "assistant", content: reply, createdAt: Date()))
            )
        } catch APIError.unauthorized {
            state.handleUnauthorized()
        } catch {
            self.error = "Couldn't send that. Try again."
        }
    }
}
