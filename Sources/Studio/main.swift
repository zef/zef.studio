import Foundation
import Publish
import Plot
import SassPublishPlugin

// This type acts as the configuration for your website.
struct Studio: Website {
  enum SectionID: String, WebsiteSectionID {
    // Add the sections that you want your website to contain here:
    case projects
    case journal
    case about
    case portfolio

    var includeInMainNav: Bool {
      return self != .portfolio
    }

    var shouldInsertDate: Bool {
      switch self {
      case .journal, .projects:
        return true
      default:
        return false
      }
    }
  }

  struct ItemMetadata: WebsiteItemMetadata {
    // Add any site-specific metadata that you want to use here.
    // var appName: String
    var image: String?
  }

  // Update these properties to configure your website:
  var url = URL(string: "https://zef.studio")!
  var name = "Zef Houssney"
  var description = ""
  var language: Language { .english }
  var imagePath: Path? { "/images/favicon.png" }
}

extension Item where Site == Studio {
  var keyImage: String? {
    guard let image = metadata.image else { return nil}
    var url: String
    if image.starts(with: "/") {
        url = image
    } else {
      url = "/\(path)/\(image)"
    }

    return ImageConverter.Size.small.url(url)
  }

  var imageCount: Int {
    let count = content.body.html.components(separatedBy: "img src").count - 1
    return count
  }

  var excerpt: String {
    let parts = content.body.html.components(separatedBy: "</time>")
    return parts.last ?? ""
  }
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
      if section.id.shouldInsertDate {
        section.mutateItems { item in
          var body = item.body
          body.html = insertDate(body: body.html, date: item.date)
          item.body = body
        }
      }
    }
  },
  .step(named: "Add Image Gallery") { context in
    guard let resourceFolder = try? context.folder(at: "resources") else {
      fatalError()
    }

    context.mutateAllSections { section in
      section.mutateItems { item in
        let relativePath = resourceFolder.path.appending(item.path.string)
        var body = item.body
        body.html = ImageGallery(body: body.html, basePath: relativePath).bodyWithGallery
        item.body = body
      }
    }
  },
  .step(named: "Convert and place images.") { context in
    guard let folder = try? context.folder(at: "") else { return }
    ImageConverter(root: folder).convertImages()
  },
//  .copyFiles(at: "Resources/projects", to: ""),
//  .copyFiles(at: "Resources/journal", to: "")
], plugins: [
  .compileSass(
    sassFilePath: "Resources/styles/styles.sass",
    cssFilePath: "styles.css"
    ),
  .formatImages(),
  .fancifyTitles()
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
