import AppKit
import Foundation
import PDFKit

let arguments = CommandLine.arguments
guard arguments.count == 2 else { exit(64) }
let size = CGSize(width: 1000, height: 700)
let image = NSImage(size: size)
image.lockFocus()
NSColor.white.setFill()
NSRect(origin: .zero, size: size).fill()
let attributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.boldSystemFont(ofSize: 46),
    .foregroundColor: NSColor.black,
]
NSAttributedString(string: "CHLOROPHYLL ABSORBS LIGHT ENERGY", attributes: attributes)
    .draw(at: NSPoint(x: 70, y: 320))
image.unlockFocus()

guard let page = PDFPage(image: image) else { exit(65) }
let document = PDFDocument()
document.insert(page, at: 0)
guard document.write(to: URL(fileURLWithPath: arguments[1])) else { exit(66) }
