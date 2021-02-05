//
//  ImageFormatModifier.swift
//  Codextended
//
//  Created by Zef Houssney on 5/7/20.
//

import Publish
import Ink
import Plot

public extension Plugin {
  static func formatImages() -> Self {
    Plugin(name: "FormatImages") { context in
      context.markdownParser.addModifier(
        .formatImages()
      )
    }
  }
}

public extension Modifier {
  // static var formatted: [String] = [String]()
  static func formatImages() -> Self {
    Modifier(target: .images) { html, markdown in

      // parse out the text and image path from the markddown
      let elements = String(markdown).deletingPrefix("![").deletingSuffix("]").components(separatedBy: "][")
      guard elements.count == 2, let text = elements.first, let path = elements.last else {
        fatalError("Unexpected format found when parsing image markdown...")
      }

      let captionData = CaptionParser.parse(text)
      let figure: Node<HTML.BodyContext> = .figure(path, alt: captionData.alt, caption: captionData.caption)

      return figure.render()
    }
  }
}

struct CaptionParser {
  static var delimiter = "|"
  static var useAltAsCaptionIndicator = "&"

  typealias CaptionData = (alt: String, caption: String?)

  static func parse(_ text: String) -> CaptionData {
    var textElements = text.components(separatedBy: delimiter)
    let alt = textElements.removeFirst().trimmingCharacters(in: .whitespaces)

    guard textElements.count <= 1 else {
      fatalError("Unexpected number of elements found when parsing caption. Too many delimiters.")
    }

    var caption = textElements.first?.trimmingCharacters(in: .whitespaces)

    if caption == useAltAsCaptionIndicator {
      caption = alt
    }

    return (alt, caption)
  }
}

extension Node where Context: HTML.BodyContext {
    static func figure(_ imagePath: String, alt: String, caption: String?) -> Self {
        if let caption = caption {
            return .element(named: "figure", nodes: [
                .img(.src(imagePath), .alt(alt)),
                .element(named: "figcaption", text: caption)
            ])
        } else {
            return .element(named: "figure", nodes: [
                .img(.src(imagePath), .alt(alt))
            ])
        }
    }
}

extension String {
    // remove a prefix if it exists
    func deletingPrefix(_ prefix: String) -> String {
        guard self.hasPrefix(prefix) else { return self }
        return String(self.dropFirst(prefix.count))
    }

    // remove a suffix if it exists
    func deletingSuffix(_ suffix: String) -> String {
        guard self.hasSuffix(suffix) else { return self }
        return String(self.dropLast(suffix.count))
    }
}
