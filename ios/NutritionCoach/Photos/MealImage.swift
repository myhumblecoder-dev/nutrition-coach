import UIKit

/// Turns whatever the camera or the library hands over into bytes the backend
/// will accept.
///
/// Three jobs, and all of them are load-bearing:
///
/// The **format**. An iPhone shoots HEIC by default, and the upload path only
/// allows jpeg, png and webp — `uploadMealPhoto.ts` has a test asserting a
/// `.heic` is rejected. Re-encoding is unconditional rather than conditional
/// on the source format, because the check would be one more thing to get
/// wrong and JPEG is what we want in every case anyway.
///
/// The **size**. The photo travels base64-encoded inside a JSON body, so App
/// Attest can sign over the same bytes the server verifies. That costs a third
/// on top, and the server refuses over 4 MB decoded. A 12 MP shot is far too
/// big for that; bounded to 1536 on the long side it lands comfortably under,
/// and the vision model downsamples to around that size anyway — so the extra
/// pixels buy nothing but upload time on a phone connection.
///
/// The **orientation**. A photo taken sideways records its rotation as an EXIF
/// tag rather than in the pixels, and the vision model is handed the raw bytes.
/// Redrawing bakes the rotation in, so the meal is never read on its side by a
/// decoder that ignores the tag.
///
/// A free function on purpose: no view owns it, and it is worth testing on its
/// own.
enum MealImage {
    static func jpegForUpload(
        _ image: UIImage,
        maxDimension: CGFloat = 1536,
        quality: CGFloat = 0.8
    ) -> Data? {
        resized(image, maxDimension: maxDimension).jpegData(compressionQuality: quality)
    }

    private static func resized(_ image: UIImage, maxDimension: CGFloat) -> UIImage {
        // Pixels, not points. `size` is in points, and a UIImage carrying a
        // scale of 2 or 3 holds that many times more pixels than its size
        // suggests — which is what the encoder writes and what the wire pays
        // for. Bounding the points would let such an image through several
        // times over the limit.
        let pixels = CGSize(
            width: image.size.width * image.scale,
            height: image.size.height * image.scale
        )
        guard pixels.width > 0, pixels.height > 0 else { return image }

        // Never upscale: enlarging invents detail the vision model then reads
        // as though it were real, and pays for it in bytes. A photo already
        // under the bound keeps its own size.
        let scale = min(1, maxDimension / max(pixels.width, pixels.height))
        let target = CGSize(width: pixels.width * scale, height: pixels.height * scale)

        // scale: 1 so the output is the pixel size asked for. The renderer
        // otherwise uses the screen's scale factor, which on a 3x device would
        // silently produce a 4608px image from a 1536pt request — undoing the
        // whole point of this function.
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1

        // Redrawn even when nothing is being scaled down, because this is also
        // where rotation gets baked in. A photo taken sideways carries its
        // orientation as an EXIF tag, and the vision model is handed the raw
        // bytes — one that ignores the tag reads the meal on its side. Making
        // the redraw unconditional means upright is a guarantee rather than
        // something that happens to hold for photos big enough to resize.
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
    }
}
