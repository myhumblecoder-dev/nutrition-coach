import XCTest
import UIKit
@testable import NutritionCoach

/// The encode step is the whole point of this type, so these are mostly about
/// bytes rather than pixels: the camera hands us HEIC, and the backend's blob
/// store accepts only jpeg, png and webp.
final class MealImageTests: XCTestCase {
    /// `scale` defaults to 1 so the numbers in these tests are pixels, which
    /// is what the encoder writes and what the size limit is about. The
    /// renderer would otherwise use the running device's scale and quietly
    /// make a "400x300" fixture 1200x900.
    private func image(width: CGFloat, height: CGFloat, scale: CGFloat = 1) -> UIImage {
        let size = CGSize(width: width, height: height)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = scale
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor.orange.setFill()
            context.fill(CGRect(origin: .zero, size: size))
        }
    }

    private func decoded(_ data: Data) throws -> UIImage {
        try XCTUnwrap(UIImage(data: data))
    }

    func testTheOutputIsAlwaysJPEGWhateverCameIn() throws {
        let data = try XCTUnwrap(MealImage.jpegForUpload(image(width: 100, height: 100)))

        // FF D8 FF is the JPEG start-of-image marker. Asserted on the bytes
        // rather than trusting the call: this is the guarantee that a HEIC
        // straight off the camera cannot reach an upload the server rejects.
        XCTAssertEqual(Array(data.prefix(3)), [0xFF, 0xD8, 0xFF])
    }

    func testALargePhotoIsBoundedByTheLongestSide() throws {
        let data = try XCTUnwrap(
            MealImage.jpegForUpload(image(width: 4000, height: 3000), maxDimension: 1536)
        )
        let result = try decoded(data)

        XCTAssertEqual(result.size.width, 1536, accuracy: 1)
        XCTAssertEqual(result.size.height, 1152, accuracy: 1, "the aspect ratio must survive")
    }

    func testATallPhotoIsBoundedByItsHeight() throws {
        let data = try XCTUnwrap(
            MealImage.jpegForUpload(image(width: 3000, height: 4000), maxDimension: 1536)
        )
        let result = try decoded(data)

        XCTAssertEqual(result.size.height, 1536, accuracy: 1)
        XCTAssertEqual(result.size.width, 1152, accuracy: 1)
    }

    func testASmallPhotoIsNeverUpscaled() throws {
        // Upscaling would invent detail the vision model then reads as real,
        // and cost bytes for it.
        let data = try XCTUnwrap(
            MealImage.jpegForUpload(image(width: 400, height: 300), maxDimension: 1536)
        )
        let result = try decoded(data)

        XCTAssertEqual(result.size.width, 400, accuracy: 1)
        XCTAssertEqual(result.size.height, 300, accuracy: 1)
    }

    func testADownscaledPhotoFitsComfortablyInsideTheRequestLimit() throws {
        let data = try XCTUnwrap(MealImage.jpegForUpload(image(width: 4032, height: 3024)))

        // The server refuses over 4 MB decoded, and base64 adds a third on the
        // wire. A 12 MP shot must land nowhere near either.
        XCTAssertLessThan(data.count, 1_000_000)
    }

    func testAnImageWithARetinaScaleIsBoundedByItsPixelsNotItsPoints() throws {
        // 600x600 points at 3x is 1800x1800 pixels. Bounding the points would
        // wave this straight through at well over the limit, which is exactly
        // what a photo arriving from some system pickers looks like.
        let data = try XCTUnwrap(
            MealImage.jpegForUpload(image(width: 600, height: 600, scale: 3), maxDimension: 1536)
        )
        let result = try decoded(data)

        XCTAssertEqual(result.size.width, 1536, accuracy: 1)
    }

    /// A photo held sideways carries its rotation as an EXIF tag rather than
    /// in the pixels. The vision model is sent the raw bytes, so a tag it does
    /// not honour means it reads the meal on its side — and "upright only if
    /// the photo happened to be big enough to resize" is not a contract worth
    /// having.
    private func rotated(_ image: UIImage, to orientation: UIImage.Orientation) -> UIImage {
        UIImage(cgImage: image.cgImage!, scale: 1, orientation: orientation)
    }

    func testASidewaysPhotoIsUprightInThePixelsWhenResized() throws {
        let sideways = rotated(image(width: 4000, height: 3000), to: .right)

        let data = try XCTUnwrap(MealImage.jpegForUpload(sideways, maxDimension: 1536))
        let result = try decoded(data)

        XCTAssertEqual(result.imageOrientation, .up, "rotation must be baked into the pixels")
        // .right turns a 4000x3000 landscape into a 3000x4000 portrait, so the
        // height is what should be pinned to the bound.
        XCTAssertEqual(result.size.height, 1536, accuracy: 1)
        XCTAssertEqual(result.size.width, 1152, accuracy: 1)
    }

    func testASidewaysPhotoIsUprightEvenWhenTooSmallToResize() throws {
        let sideways = rotated(image(width: 400, height: 300), to: .right)

        let data = try XCTUnwrap(MealImage.jpegForUpload(sideways, maxDimension: 1536))
        let result = try decoded(data)

        XCTAssertEqual(result.imageOrientation, .up)
        XCTAssertEqual(result.size.width, 300, accuracy: 1)
        XCTAssertEqual(result.size.height, 400, accuracy: 1)
    }
}
