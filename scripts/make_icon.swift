// Draws the Playtime app icon (the flower buddy with headphones on a pop-star stage) as a 1024×1024 PNG.
// Usage (macOS):
//   swift scripts/make_icon.swift assets/icon-1024.png
//   for s in 180 192 512; do sips -z $s $s assets/icon-1024.png --out public/icons/icon-$s.png; done
//   cp public/icons/icon-512.png public/icons/icon-maskable-512.png
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let outPath = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "icon-1024.png"
let size = 1024
let s = CGFloat(size)
let space = CGColorSpaceCreateDeviceRGB()
guard let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                          space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { fatalError() }

func color(_ hex: UInt32, _ a: CGFloat = 1) -> CGColor {
    CGColor(colorSpace: space, components: [CGFloat((hex >> 16) & 255) / 255, CGFloat((hex >> 8) & 255) / 255, CGFloat(hex & 255) / 255, a])!
}

// Note: CoreGraphics y axis points up.

// Stage gradient (purple → magenta → pink), like the app.
let bg = CGGradient(colorsSpace: space, colors: [color(0x5A23B5), color(0xA0189A), color(0xF2457E)] as CFArray, locations: [0, 0.55, 1])!
ctx.drawLinearGradient(bg, start: CGPoint(x: 0, y: s), end: CGPoint(x: s, y: 0), options: [])
let glow = CGGradient(colorsSpace: space, colors: [color(0xFF8AD8, 0.75), color(0xFF8AD8, 0)] as CFArray, locations: [0, 1])!
ctx.drawRadialGradient(glow, startCenter: CGPoint(x: s / 2, y: s), startRadius: 0, endCenter: CGPoint(x: s / 2, y: s), endRadius: 620, options: [])

// Two spotlight beams.
for (top, bottomL, bottomR, tint) in [(CGPoint(x: 150, y: 1024), 60.0, 520.0, color(0xFFFFFF, 0.16)), (CGPoint(x: 874, y: 1024), 520.0, 980.0, color(0xFFE478, 0.16))] {
    ctx.setFillColor(tint)
    ctx.move(to: CGPoint(x: top.x - 30, y: top.y))
    ctx.addLine(to: CGPoint(x: top.x + 30, y: top.y))
    ctx.addLine(to: CGPoint(x: bottomR, y: 0))
    ctx.addLine(to: CGPoint(x: bottomL, y: 0))
    ctx.closePath()
    ctx.fillPath()
}

// Sparkles (four-point stars).
func sparkle(_ c: CGPoint, _ r: CGFloat, _ a: CGFloat) {
    ctx.setFillColor(color(0xFFFFFF, a))
    ctx.move(to: CGPoint(x: c.x, y: c.y + r))
    ctx.addQuadCurve(to: CGPoint(x: c.x + r, y: c.y), control: CGPoint(x: c.x + r * 0.15, y: c.y + r * 0.15))
    ctx.addQuadCurve(to: CGPoint(x: c.x, y: c.y - r), control: CGPoint(x: c.x + r * 0.15, y: c.y - r * 0.15))
    ctx.addQuadCurve(to: CGPoint(x: c.x - r, y: c.y), control: CGPoint(x: c.x - r * 0.15, y: c.y - r * 0.15))
    ctx.addQuadCurve(to: CGPoint(x: c.x, y: c.y + r), control: CGPoint(x: c.x - r * 0.15, y: c.y + r * 0.15))
    ctx.fillPath()
}
sparkle(CGPoint(x: 150, y: 860), 46, 0.9)
sparkle(CGPoint(x: 880, y: 820), 34, 0.8)
sparkle(CGPoint(x: 860, y: 190), 40, 0.85)
sparkle(CGPoint(x: 170, y: 210), 28, 0.7)

let center = CGPoint(x: s * 0.5, y: s * 0.52)

// Petals
for i in 0..<8 {
    ctx.saveGState()
    ctx.translateBy(x: center.x, y: center.y)
    ctx.rotate(by: CGFloat(i) * .pi / 4)
    ctx.setFillColor(i % 2 == 0 ? color(0xFF6B9E) : color(0xFF8DB4))
    ctx.fillEllipse(in: CGRect(x: -88, y: 90, width: 176, height: 240))
    ctx.restoreGState()
}

// Face
let faceR: CGFloat = 170
let face = CGGradient(colorsSpace: space, colors: [color(0xFFE27A), color(0xFFC72E), color(0xFFAA40)] as CFArray, locations: [0, 0.7, 1])!
ctx.saveGState()
ctx.addEllipse(in: CGRect(x: center.x - faceR, y: center.y - faceR, width: faceR * 2, height: faceR * 2))
ctx.clip()
ctx.drawRadialGradient(face, startCenter: CGPoint(x: center.x - 30, y: center.y + 40), startRadius: 0, endCenter: center, endRadius: faceR * 1.2, options: [.drawsAfterEndLocation])
ctx.restoreGState()
ctx.setStrokeColor(color(0xFF9438))
ctx.setLineWidth(12)
ctx.strokeEllipse(in: CGRect(x: center.x - faceR, y: center.y - faceR, width: faceR * 2, height: faceR * 2))

// Eyes
ctx.setFillColor(color(0x3D2E61))
for dx in [-58.0, 58.0] { ctx.fillEllipse(in: CGRect(x: center.x + dx - 22, y: center.y + 2, width: 44, height: 62)) }
ctx.setFillColor(color(0xFFFFFF))
for dx in [-58.0, 58.0] { ctx.fillEllipse(in: CGRect(x: center.x + dx - 1, y: center.y + 38, width: 16, height: 16)) }
// Cheeks
ctx.setFillColor(color(0xFF6B9E, 0.55))
for dx in [-104.0, 104.0] { ctx.fillEllipse(in: CGRect(x: center.x + dx - 26, y: center.y - 44, width: 52, height: 36)) }
// Big smile
ctx.setFillColor(color(0xC0334D))
ctx.move(to: CGPoint(x: center.x - 62, y: center.y - 40))
ctx.addQuadCurve(to: CGPoint(x: center.x + 62, y: center.y - 40), control: CGPoint(x: center.x, y: center.y - 150))
ctx.closePath()
ctx.fillPath()

// Headphones: band over the head and two purple ear cups.
ctx.setStrokeColor(color(0x3D2E61))
ctx.setLineWidth(34)
ctx.setLineCap(.round)
ctx.addArc(center: CGPoint(x: center.x, y: center.y + 5), radius: 225, startAngle: .pi * 0.06, endAngle: .pi * 0.94, clockwise: false)
ctx.strokePath()
for dx in [-222.0, 222.0] {
    let cup = CGRect(x: center.x + dx - 48, y: center.y - 80, width: 96, height: 160)
    let path = CGPath(roundedRect: cup, cornerWidth: 44, cornerHeight: 44, transform: nil)
    ctx.addPath(path)
    ctx.setFillColor(color(0x996BF2))
    ctx.fillPath()
    ctx.addPath(path)
    ctx.setStrokeColor(color(0x3D2E61))
    ctx.setLineWidth(16)
    ctx.strokePath()
    ctx.setFillColor(color(0xFF6B9E))
    ctx.fillEllipse(in: CGRect(x: center.x + dx - 20, y: center.y - 20, width: 40, height: 40))
}

guard let image = ctx.makeImage(),
      let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: outPath) as CFURL, UTType.png.identifier as CFString, 1, nil)
else { fatalError("could not write") }
CGImageDestinationAddImage(dest, image, nil)
CGImageDestinationFinalize(dest)
print("Wrote \(outPath)")
