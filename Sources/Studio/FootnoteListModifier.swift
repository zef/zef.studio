//
//  FancyTitleModifier.swift
//  Codextended
//
//  Created by Zef Houssney on 2/1/21.
//

import Publish
import Ink
import Foundation

// this takes title-cased h1 tags and surround the lowercase words with span tags
// this allows us to style the lowercase words in a specific manner
public extension Plugin {
  static func formatFootnotes() -> Self {
    Plugin(name: "FormatFootnotes") { context in
      context.markdownParser.addModifier(
        .formatFootnoteLinks()
      )
      context.markdownParser.addModifier(
        .formatFootnoteList()
      )
    }
  }
}

public extension Modifier {
  static func formatFootnoteLinks() -> Self {
    Modifier(target: .links) { html, markdown in

      let range = NSRange(html.startIndex..<html.endIndex, in: html)
      guard let regex = try? NSRegularExpression(pattern: #"footnotes">(\d+)<"#, options: []) else { fatalError() }
      let match = regex.firstMatch(in: html, options: [], range: range)

      if let match = match, let range = Range(match.range(at: 1), in: html) {
        let reference = html[range]
        let id = "id=\"footnote-\(reference)\""
        return html.replacingOccurrences(of: "<a ", with: "<a \(id) ")
      }

      // href="#footnotes">1<

      return html
    }
  }

  static func formatFootnoteList() -> Self {
    Modifier(target: .lists) { html, markdown in
      // Identify footnote lists by their use of the format "1)", using the paretheses rather than a period.
      // Normal ordered lists can use the format "1."
      guard let _ = markdown.range(of: #"^\d+\)"#, options: .regularExpression) else  {
        return html
      }

      let list = html.replacingOccurrences(of: "<ol><li>", with: "<ol id=\"footnotes\"><li>")
      var reference = 0

      return list.components(separatedBy: "</li>").reduce("") { result, part in
        guard part != "</ol>" else {
          return result + part
        }
        reference += 1

        let link =  "<a href=\"#footnote-\(reference)\">↩︎</a>"
        return result + part + link + "</li>"
      }
    }
  }
}
