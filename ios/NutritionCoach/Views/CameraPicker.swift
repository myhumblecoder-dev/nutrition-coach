import SwiftUI
import UIKit

/// The camera, which SwiftUI still has no native control for.
///
/// `PhotosPicker` covers the library and needs no permission prompt at all;
/// this covers the other half, and is the reason `NSCameraUsageDescription`
/// exists in Info.plist. Kept to the smallest possible wrapper — anything
/// clever here is untestable in a Simulator that has no camera.
struct CameraPicker: UIViewControllerRepresentable {
    let onPicked: (UIImage) -> Void
    /// Called whether the user took a shot or backed out.
    ///
    /// The controller is presented by a `fullScreenCover`, so SwiftUI owns
    /// whether it is on screen — dismissing the UIKit controller from inside
    /// its own delegate would leave the cover's binding still true and strand
    /// an empty screen with no way back. The binding is the only thing that
    /// closes this.
    let onFinished: () -> Void

    /// False in the Simulator and on any device without a usable camera, which
    /// is why the caller checks before offering the option rather than showing
    /// a button that presents an empty screen.
    static var isAvailable: Bool {
        UIImagePickerController.isSourceTypeAvailable(.camera)
    }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        // The back camera: a meal is on the table, not in front of your face.
        picker.cameraDevice = .rear
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onPicked: onPicked, onFinished: onFinished)
    }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        private let onPicked: (UIImage) -> Void
        private let onFinished: () -> Void

        init(onPicked: @escaping (UIImage) -> Void, onFinished: @escaping () -> Void) {
            self.onPicked = onPicked
            self.onFinished = onFinished
        }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            // .editedImage is never requested, so .originalImage is the only
            // key that can be here.
            if let image = info[.originalImage] as? UIImage { onPicked(image) }
            onFinished()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onFinished()
        }
    }
}
