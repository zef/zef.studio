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
      context.markdownParser.addModifier(
        .formatImageLists()
      )
    }
  }
}

public extension Modifier {
  // static var formatted: [String] = [String]()
  static func formatImages() -> Self {
    Modifier(target: .images) { html, markdown in

      // parse out the text and image path from the markddown
      let elements = String(markdown).deletingPrefix("![").deletingSuffix(")").components(separatedBy: "](")
      guard elements.count == 2, let text = elements.first, let path = elements.last else {
        fatalError("Unexpected format found when parsing image markdown...")
      }

      let captionData = CaptionParser.parse(text)
      let figure: Node<HTML.BodyContext> = .figure(path, alt: captionData.alt, caption: captionData.caption, classes: captionData.htmlClass)

      return figure.render()
    }
  }


  static func formatImageLists() -> Self {
    return Modifier(target: .lists) { html, markdown in
      return html.replacingOccurrences(of: "<ul><li><figure", with: "<ul class='image-list'><li><figure")
    }
  }
}

// Here we can take a string that is entered where the "alt" tag is normally placed in markdown
// and parse out some additional data that we want to include.
//
// Only use alt text:
// ![Some Alt Text][image_path.jpg]
//
// Use alt text, and duplicate that text as the "caption" by including the delimiter character,
// and an ampersand to indicate the duplication:
// ![Some Alt Text |&][image_path.jpg]
//
// Use alt text, and separate text as the "caption" by using the delimiter character followed by caption text:
// ![Some Alt Text | Some caption text.][image_path.jpg]
//
// Finally, including ".class-name" at the beginning of the alt text will return that as a class string
// to be inserted in the HTML of the figure tag. You can include multiple classes with no space like this ".class-one.class-two"
// ![.some-class Some Alt Text][image_path.jpg]


struct CaptionParser {
  static var delimiter = "|"
  static var useAltAsCaptionIndicator = "&"

  typealias CaptionData = (alt: String, caption: String?, htmlClass: String?)

  static func parse(_ text: String) -> CaptionData {
    var textElements = text.components(separatedBy: delimiter)
    var alt = textElements.removeFirst().trimmingCharacters(in: .whitespaces)

    guard textElements.count <= 1 else {
      fatalError("Unexpected number of elements found when parsing caption. Too many delimiters.")
    }

    var caption = textElements.first?.trimmingCharacters(in: .whitespaces)

    var htmlClass: String? = nil
    if let classMatch = alt.range(of: #"^\.\S+\s"#, options: .regularExpression) {
      htmlClass = alt[classMatch.lowerBound..<classMatch.upperBound]
        .replacingOccurrences(of: ".", with: " ")
        .trimmingCharacters(in: .whitespaces)

      alt = String(alt[classMatch.upperBound...])
    }

    if caption == useAltAsCaptionIndicator {
      caption = alt
    }

    return (alt, caption, htmlClass)
  }
}

extension Node where Context: HTML.BodyContext {
  static func figure(_ imagePath: String, alt: String, caption: String?, classes: String?) -> Self {
    return .element(named: "figure", nodes: [
      .img(.src(imagePath), .alt(alt)),
      .if(caption != nil,
          .element(named: "figcaption", text: caption ?? "")
      ),
      .if(classes != nil, .class(classes ?? ""))
    ])
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
