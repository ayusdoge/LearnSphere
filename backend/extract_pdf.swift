import AppKit
import Foundation
import PDFKit
import Vision

let arguments = CommandLine.arguments
guard arguments.count == 2 else {
    fputs("Expected one PDF path.\n", stderr)
    exit(64)
}

guard let document = PDFDocument(url: URL(fileURLWithPath: arguments[1])), document.pageCount > 0 else {
    fputs("Could not read PDF.\n", stderr)
    exit(65)
}

func recognizeText(on page: PDFPage) -> String {
    let thumbnail = page.thumbnail(of: CGSize(width: 1600, height: 1600), for: .mediaBox)
    var imageRect = CGRect(origin: .zero, size: thumbnail.size)
    guard let image = thumbnail.cgImage(forProposedRect: &imageRect, context: nil, hints: nil) else {
        return ""
    }

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.automaticallyDetectsLanguage = true
    if let available = try? request.supportedRecognitionLanguages() {
        let preferred = ["en-US", "hi-IN"].filter { available.contains($0) }
        if !preferred.isEmpty {
            request.recognitionLanguages = preferred
        }
    }

    do {
        try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
    } catch {
        return ""
    }

    let observations = (request.results ?? []).sorted { first, second in
        let verticalDifference = abs(first.boundingBox.midY - second.boundingBox.midY)
        if verticalDifference > 0.015 {
            return first.boundingBox.midY > second.boundingBox.midY
        }
        return first.boundingBox.minX < second.boundingBox.minX
    }
    return observations.compactMap { observation in
        guard let candidate = observation.topCandidates(1).first, candidate.confidence >= 0.2 else {
            return nil
        }
        return candidate.string
    }.joined(separator: "\n")
}

let maximumPages = min(document.pageCount, 250)
let maximumOcrPages = 50
let maximumOutputBytes = 5_000_000
var ocrPageCount = 0
var output = ""

for pageIndex in 0..<maximumPages {
    guard let page = document.page(at: pageIndex) else { continue }
    let selectableText = page.string?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let letterCount = selectableText.unicodeScalars.filter { CharacterSet.letters.contains($0) }.count
    let needsOcr = letterCount < 10
    let pageText: String
    let pageLabel: String

    if needsOcr {
        guard ocrPageCount < maximumOcrPages else { continue }
        ocrPageCount += 1
        pageText = recognizeText(on: page)
        pageLabel = "Page \(pageIndex + 1) (OCR)"
    } else {
        pageText = selectableText
        pageLabel = "Page \(pageIndex + 1)"
    }

    guard !pageText.isEmpty else { continue }
    let block = "# \(pageLabel)\n\(pageText)\n"
    if output.utf8.count + block.utf8.count > maximumOutputBytes {
        break
    }
    output += block
}

FileHandle.standardOutput.write(Data(output.utf8))
