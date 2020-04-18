import Foundation
import Publish
import Plot
import SassPublishPlugin

// This type acts as the configuration for your website.
struct Studio: Website {
  enum SectionID: String, WebsiteSectionID {
    // Add the sections that you want your website to contain here:
    case posts
//    case portfolio
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

  var portfolioContent: Content {
    Content(
      title: "Portfolio",
      description: "Zef Houssney iOS Development Portfolio.",
      body: Content.Body(node: .portfolio(for: Client.all)),
      date: Date(),
      lastModified: Date(),
      imagePath: nil,
      audio: nil,
      video: nil
    )
  }
}

let studio = Studio()


try studio.publish(withTheme: .studio, additionalSteps: [
  .addPage(studio.portfolioPage)
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
