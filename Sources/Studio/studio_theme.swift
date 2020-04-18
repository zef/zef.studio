import Foundation
import Publish
import Plot

extension Theme where Site == Studio {
  static var studio: Self {
    Theme(
      htmlFactory: StudioHTMLFactory<Studio>(),
      resourcePaths: [
      ]
    )
  }

  struct StudioHTMLFactory<Site: Website>: HTMLFactory {

    func studioTemplate(location: Location, selectedSection: Studio.SectionID? = nil, context: PublishingContext<Studio>, body: () -> Node<HTML.BodyContext>) -> HTML {
      HTML(
        .lang(context.site.language),
        .head(for: location, on: context.site),
        .body(
          .header(for: context, selectedSection: selectedSection),
          .div(.class("content"),
            body()
          ),
          .footer(for: context.site),
          .googleAnalytics()
        )
      )
    }

    func makeIndexHTML(for index: Index,
                       context: PublishingContext<Studio>) throws -> HTML {
      studioTemplate(location: index, context: context) {
        .group(
          .h1(.text(index.title)),
          .itemList(
            for: context.allItems(
              sortedBy: \.date,
              order: .descending
            ),
            on: context.site
          )
        )
      }
    }

    func makeSectionHTML(for section: Section<Studio>,
                         context: PublishingContext<Studio>) throws -> HTML {
      if section.id == .portfolio {
        // I tried to override this content in a "mutateAllSections" block, but that does not
        // allow for overriding the body content, so I'm hacking it in here in the theme.
        return studioTemplate(location: section, selectedSection: section.id, context: context) {
          .portfolio(for: Client.all)
        }
      } else {
        return studioTemplate(location: section, selectedSection: section.id, context: context) {
          .group(
            .h1(.text(section.title)),
            .itemList(for: section.items, on: context.site)
          )
        }
      }
    }

    func makeItemHTML(for item: Item<Studio>,
                      context: PublishingContext<Studio>) throws -> HTML {
      studioTemplate(location: item, selectedSection: item.sectionID, context: context) {
        .group(
          .article(
            .div(
              .class("content"),
              .contentBody(item.body)
            ),
            .span("Tagged with: "),
            .tagList(for: item, on: context.site)
          )
        )
      }
    }

    func makePageHTML(for page: Page,
                      context: PublishingContext<Studio>) throws -> HTML {
      studioTemplate(location: page, context: context) {
        .div(.class("page-\(page.title.lowercased())"),
          .contentBody(page.body)
        )
      }
    }

    func makeTagListHTML(for page: TagListPage,
                         context: PublishingContext<Studio>) throws -> HTML? {
      studioTemplate(location: page, context: context) {
        .group(
          .h1("Browse all tags"),
          .ul(
            .class("all-tags"),
            .forEach(page.tags.sorted()) { tag in
              .li(
                .class("tag"),
                .a(
                  .href(context.site.path(for: tag)),
                  .text(tag.string)
                )
              )
            }
          )
        )
      }
    }

    func makeTagDetailsHTML(for page: TagDetailsPage,
                            context: PublishingContext<Studio>) throws -> HTML? {
      studioTemplate(location: page, context: context) {
        .group(
          .h1(
            "Tagged with ",
            .span(.class("tag"), .text(page.tag.string))
          ),
          .a(
            .class("browse-all"),
            .text("Browse all tags"),
            .href(context.site.tagListPath)
          ),
          .itemList(
            for: context.items(
              taggedWith: page.tag,
              sortedBy: \.date,
              order: .descending
            ),
            on: context.site
          )
        )
      }
    }
  }
}

extension Node where Context == HTML.BodyContext {

  static func header<T: Website>(for context: PublishingContext<T>, selectedSection: T.SectionID?) -> Node {
    let sectionIDs = T.SectionID.allCases
    var shouldShowNav = true

    if let section = selectedSection as? Studio.SectionID, section == .portfolio {
        shouldShowNav = false
    }

    return .header(
      .group(
        .div(.class("logo")),
        .a(.class("site-name"), .href("/"), .text(context.site.name)),
        .p(.class("site-name-subtitle"), "Senior iOS App Developer &nbsp;•&nbsp; Boulder, Colorado"),
        .if(sectionIDs.count > 1 && shouldShowNav,
            .nav(
              .ul(.forEach(sectionIDs) { section in
                .li(.a(
                  .class(section == selectedSection ? "selected" : ""),
                  .href(context.sections[section].path),
                  .text(context.sections[section].title)
                  ))
                })
          )
        )
      )
    )
  }

  static func itemList(for items: [Item<Studio>], on site: Studio) -> Node {
    return .ul(
      .class("item-list"),
      .forEach(items) { item in
        .li(.article(
          .h1(.a(
            .href(item.path),
            .text(item.title)
            )),
          .tagList(for: item, on: site),
//          .text(item.metadata.appName),
          .p(.text(item.description))
          ))
      }
    )
  }

  static func tagList<T: Website>(for item: Item<T>, on site: T) -> Node {
    return .ul(.class("tag-list"), .forEach(item.tags) { tag in
      .li(.a(
        .href(site.path(for: tag)),
        .text(tag.string)
        ))
      })
  }

  static func footer<T: Website>(for site: T) -> Node {
    .footer(
//      .p(
//        .text("Generated using "),
//        .a(
//          .text("Publish"),
//          .href("https://github.com/johnsundell/publish")
//        )
//      ),
//      .p(
//        .a(
//          .text("RSS feed"),
//          .href("/feed.rss")
//        )
//      )
    )
  }


  static func googleAnalytics(userToken: String = "UA-118277061-2") -> Node {
    .raw(
        """
<script async src="https://www.googletagmanager.com/gtag/js?id=\(userToken)"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','\(userToken)');</script>
"""
    )
  }

}
