import Foundation
import Publish
import Plot
import SassPublishPlugin

// This type acts as the configuration for your website.
struct Studio: Website {
  enum SectionID: String, WebsiteSectionID {
    // Add the sections that you want your website to contain here:
    case about
    case journal
    case portfolio
  }

  struct ItemMetadata: WebsiteItemMetadata {
    // Add any site-specific metadata that you want to use here.
//    var appName: String
    // var Icon
  }

  // Update these properties to configure your website:
  var url = URL(string: "https://zef.studio")!
  var name = "Zef Houssney"
  var description = "My name is Zef. Welcome to my studio."
  var language: Language { .english }
  var imagePath: Path? { "/images/favicon.png" }
}

func insertDate(body: String, date: Date) -> String {
  var body = body

  if let range = body.range(of: "</h1>") {
    let date = Node<HTML.BodyContext>.element(named: "time", nodes: [
        .attribute(named: "datetime", value: date.yearMonthDay),
        .text("\(date.long)")
    ]).render()

    body.insert(contentsOf: date, at: range.upperBound)
  }

  return body
}

let studio = Studio()


try studio.publish(withTheme: .studio, additionalSteps: [
  .step(named: "Add Portfolio Description") { context in
    context.mutateAllSections { section in
      if section.id == .portfolio {
        section.title = "iOS Development Portfolio"
        section.content.description = "Zef Houssney — iOS Development Portfolio"
      }
    }
  },
  .step(named: "Insert Post Date After Title") { context in
    context.mutateAllSections { section in
      if section.id == .journal {
        section.mutateItems { item in
          var body = item.body
          body.html = insertDate(body: body.html, date: item.date)
          item.body = body
        }
      }
    }
  }
], plugins: [
  .compileSass(
      sassFilePath: "Resources/styles/styles.sass",
      cssFilePath: "styles.css"
  )
])

//try studio.publish(using: [
//  .group(plugins.map(PublishingStep.installPlugin)),
//  .optional(.copyResources()),
//  .addMarkdownFiles(),
//  .sortItems(by: \.date, order: .descending),
//  .addPage(studio.portfolioPage)
//
//    .generateHTML(withTheme: theme, indentation: indentation),
//  .unwrap(rssFeedConfig) { config in
//    .generateRSSFeed(
//      including: rssFeedSections,
//      config: config
//    )
//  },
//  .generateSiteMap(indentedBy: indentation),
//  .unwrap(deploymentMethod, PublishingStep.deploy)
//])
