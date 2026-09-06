import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

// Roughly's app icon: the approximately-equal sign. The product's whole
// argument is that a calorie count off a photograph is an estimate and that
// pretending otherwise is the lie — "≈" is that argument as a glyph.

let size = 1024.0
let space = CGColorSpaceCreateDeviceRGB()

// noneSkipLast, not premultipliedLast: an app icon with an alpha channel is
// rejected at upload, and this is the point where the channel would be added.
guard let ctx = CGContext(
    data: nil, width: Int(size), height: Int(size), bitsPerComponent: 8,
    bytesPerRow: 0, space: space,
    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
) else { fatalError("could not create the context") }

func rgb(_ hex: UInt32) -> CGColor {
    CGColor(
        colorSpace: space,
        components: [
            CGFloat((hex >> 16) & 0xff) / 255,
            CGFloat((hex >> 8) & 0xff) / 255,
            CGFloat(hex & 0xff) / 255,
            1,
        ]
    )!
}

// Diagonal emerald gradient. Flat colour reads as a placeholder at this size;
// a shallow gradient gives the glyph something to sit on without becoming
// decoration in its own right.
let gradient = CGGradient(
    colorsSpace: space,
    colors: [rgb(0x10B981), rgb(0x059669), rgb(0x046C4E)] as CFArray,
    locations: [0, 0.55, 1]
)!
ctx.drawLinearGradient(
    gradient,
    start: CGPoint(x: 0, y: size),
    end: CGPoint(x: size, y: 0),
    options: []
)

/// One tilde stroke, as a sampled sine wave.
///
/// Sampled rather than fitted with beziers: at 1024px the segments are far
/// below a pixel, and the arithmetic is something a reader can check.
func wave(centreY: CGFloat, amplitude: CGFloat, from x0: CGFloat, to x1: CGFloat) -> CGPath {
    let path = CGMutablePath()
    let steps = 240
    for i in 0...steps {
        let t = CGFloat(i) / CGFloat(steps)
        let x = x0 + (x1 - x0) * t
        let y = centreY + amplitude * sin(2 * .pi * t)
        if i == 0 { path.move(to: CGPoint(x: x, y: y)) } else { path.addLine(to: CGPoint(x: x, y: y)) }
    }
    return path
}

// Kept inside the central ~62% so the glyph survives both the rounded-rect
// mask and the small sizes the icon is actually seen at.
let inset = 218.0
let stroke = 74.0
let amplitude = 60.0

ctx.setStrokeColor(rgb(0xFFFFFF))
ctx.setLineWidth(stroke)
ctx.setLineCap(.round)
ctx.setLineJoin(.round)

for centreY in [size / 2 + 96, size / 2 - 96] {
    ctx.addPath(wave(centreY: centreY, amplitude: amplitude, from: inset, to: size - inset))
    ctx.strokePath()
}

guard let image = ctx.makeImage() else { fatalError("could not render") }

let out = URL(fileURLWithPath: CommandLine.arguments[1])
guard let dest = CGImageDestinationCreateWithURL(out as CFURL, UTType.png.identifier as CFString, 1, nil)
else { fatalError("could not open \(out.path)") }
CGImageDestinationAddImage(dest, image, nil)
guard CGImageDestinationFinalize(dest) else { fatalError("could not write the png") }
print("wrote \(out.path)")
