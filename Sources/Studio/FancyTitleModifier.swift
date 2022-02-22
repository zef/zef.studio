//
//  FancyTitleModifier.swift
//  Codextended
//
//  Created by Zef Houssney on 2/1/21.
//

import Publish
import Ink

// this takes title-cased h1 tags and surround the lowercase words with span tags
// this allows us to style the lowercase words in a specific manner
public extension Plugin {
  static func fancifyTitles() -> Self {
    Plugin(name: "InsertDate") { context in
      context.markdownParser.addModifier(
        .fancifyTitle()
      )
    }
  }
}

public extension Modifier {
  static func fancifyTitle() -> Self {
    Modifier(target: .headings) { html, markdown in
      // identify h1 tags, and get the bounds so we know where the tag is and where the content is
      guard let openTag = html.range(of: "<h1>")?.upperBound, let closeTag = html.range(of: "</h1>")?.lowerBound else {
        return html
      }
      // now we surround all lowercase words within the content with a span tag.
      return html.replacingOccurrences(
        of: #"\b([a-z]+)\b"#,
        with: "<span>$1</span>",
        options: .regularExpression,
        range: Range(uncheckedBounds: (openTag, closeTag))
      )
      // and finally combine back-to-back spans together, so rendered whitespace is correct, and there are fewer tags
      .replacingOccurrences(
        of: #"</span>\s+<span>"#,
        with: " ",
        options: .regularExpression
      )
    }
  }
}
