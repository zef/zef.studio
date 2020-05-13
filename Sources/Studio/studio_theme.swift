import Foundation
import Publish
import Plot

extension Theme where Site == Studio {
  static var studio: Self {
    Theme(
      htmlFactory: StudioHTMLFactory<Studio>(),
      resourcePaths: [ ]
    )
  }

  struct StudioHTMLFactory<Site: Website>: HTMLFactory {

    func studioTemplate(location: Location, selectedSection: Studio.SectionID? = nil, context: PublishingContext<Studio>, body: () -> Node<HTML.BodyContext>) -> HTML {
      HTML(
        .lang(context.site.language),
        .customHead(for: location, on: context.site),
        .body(
          .div(.class("content"),
            .header(for: context, selectedSection: selectedSection),
            .div(.class("body"),
                 body()
            )
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
//            .h1(.text(section.title)),
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
            .div(.class("article-content"),
              .contentBody(item.body)
            ),
            .tagList(for: item, on: context.site)
          )
        )
      }
    }

    func makePageHTML(for page: Page,
                      context: PublishingContext<Studio>) throws -> HTML {
      studioTemplate(location: page, context: context) {
        .div(.class("page-\(page.title.lowercased())"),
          .article(
            .contentBody(page.body)
          )
        )
      }
    }

    func makeTagListHTML(for page: TagListPage,
                         context: PublishingContext<Studio>) throws -> HTML? {
      studioTemplate(location: page, context: context) {
        .group(
          .h1("Tags"),
          .ul(
            .class("tags"),
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
    var headerClass = ""

    if let section = selectedSection as? Studio.SectionID, section == .portfolio {
        shouldShowNav = false
        headerClass = "portfolio"
    }

    return .header(
      .class(headerClass),
      .group(
        .a(.class("logo"), .href("/")),
        .if(!shouldShowNav,
          .group(
            .a(.class("site-name"), .href("/"), .text(context.site.name)),
            .p(.class("site-name-subtitle"), "Senior iOS App Developer &nbsp;•&nbsp; Boulder, Colorado")
          )
        ),
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
    return .ul(.class("article-list"),
      .forEach(items) { item in
        .li(
          .a(
            .href(item.path),
            .article(
              .if(item.metadata.image != nil,
                .img(.src(item.keyImage ?? ""))
              ),
              .h2(
                .text(item.title)
              )
              //            .tagList(for: item, on: site),
              //            .p(.text(item.description))
            )
          )
        )
      }
    )
  }

  static func tagList<T: Website>(for item: Item<T>, on site: T) -> Node {
    return .ul(.class("tags"), .forEach(item.tags) { tag in
      .li(.a(
        .href(site.path(for: tag)),
        .text(tag.string)
        ))
      })
  }

  static func footer<T: Website>(for site: T) -> Node {
    .footer(
      .div(.class("footer-content"),
          .ul(.forEach(IconLink.all) { icon in
            .li(
              .a(.class("icon \(icon.name)"),
                .text(icon.text),
                .href(icon.link)
              )
            )
          }
        )
      )
//      .p(
//        .a(
//          .text("RSS feed"),
//          .href("/feed.rss")
//        )
//      )
    )
  }

  struct IconLink {
    var text: String
    var name: String
    var link: String

    static var all: [IconLink] {
      [
        IconLink(
          text: "@zefhous on Twitter",
          name: "twitter",
          link: "https://twitter.com/zefhous/"
        ),
        IconLink(
          text: "zefhous on Instagram",
          name: "instagram",
          link: "https://www.instagram.com/zefhous/"
        ),
        IconLink(
          text: "Home",
          name: "zef",
          link: "/"
        ),
        IconLink(
          text: "zef on GitHub",
          name: "github",
          link: "https://github.com/zef"
        ),
        IconLink(
          text: "Email me at zef@zef.studio",
          name: "email",
          link: "mailto:zef@zef.studio"
        ),
      ]
    }
  }


  static func googleAnalytics(userToken: String = "UA-118277061-2") -> Node {
    .raw(
      """
      <script async src="https://www.googletagmanager.com/gtag/js?id=\(userToken)"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','\(userToken)');</script>
      """
    )
  }
}

public extension Node where Context == HTML.HeadContext {
  static func customFavicon() -> Node {
    .raw(
"""
<link rel="apple-touch-icon" sizes="57x57" href="/images/favicons/apple-icon-57x57.png">
<link rel="apple-touch-icon" sizes="60x60" href="/images/favicons/apple-icon-60x60.png">
<link rel="apple-touch-icon" sizes="72x72" href="/images/favicons/apple-icon-72x72.png">
<link rel="apple-touch-icon" sizes="76x76" href="/images/favicons/apple-icon-76x76.png">
<link rel="apple-touch-icon" sizes="114x114" href="/images/favicons/apple-icon-114x114.png">
<link rel="apple-touch-icon" sizes="120x120" href="/images/favicons/apple-icon-120x120.png">
<link rel="apple-touch-icon" sizes="144x144" href="/images/favicons/apple-icon-144x144.png">
<link rel="apple-touch-icon" sizes="152x152" href="/images/favicons/apple-icon-152x152.png">
<link rel="apple-touch-icon" sizes="180x180" href="/images/favicons/apple-icon-180x180.png">
<link rel="icon" type="image/png" sizes="192x192"  href="/images/favicons/android-icon-192x192.png">
<link rel="icon" type="image/png" sizes="32x32" href="/images/favicons/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="96x96" href="/images/favicons/favicon-96x96.png">
<link rel="icon" type="image/png" sizes="16x16" href="/images/favicons/favicon-16x16.png">
<meta name="msapplication-TileColor" content="#ffffff">
<meta name="msapplication-TileImage" content="/images/favicons/ms-icon-144x144.png">
<meta name="theme-color" content="#ffffff">
""".replacingOccurrences(of: "\n", with: "")
    )
  }
}


// taken from PlotComponents.swift and modified
public extension Node where Context == HTML.DocumentContext {
    /// Add an HTML `<head>` tag within the current context, based
    /// on inferred information from the current location and `Website`
    /// implementation.
    /// - parameter location: The location to generate a `<head>` tag for.
    /// - parameter site: The website on which the location is located.
    /// - parameter titleSeparator: Any string to use to separate the location's
    ///   title from the name of the website. Default: `" | "`.
    /// - parameter stylesheetPaths: The paths to any stylesheets to add to
    ///   the resulting HTML page. Default: `styles.css`.
    /// - parameter rssFeedPath: The path to any RSS feed to associate with the
    ///   resulting HTML page. Default: `feed.rss`.
    /// - parameter rssFeedTitle: An optional title for the page's RSS feed.
    static func customHead<T: Website>(
        for location: Location,
        on site: T,
        titleSeparator: String = " | ",
        stylesheetPaths: [Path] = ["/styles.css"],
        rssFeedPath: Path? = .defaultForRSSFeed,
        rssFeedTitle: String? = nil
    ) -> Node {
        var title = location.title

        if title.isEmpty {
            title = site.name
        } else {
            title.append(titleSeparator + site.name)
        }

        var description = location.description

        if description.isEmpty {
            description = site.description
        }

        return .head(
            .encoding(.utf8),
            .siteName(site.name),
            .url(site.url(for: location)),
            .title(title),
            .description(description),
            .twitterCardType(location.imagePath == nil ? .summary : .summaryLargeImage),
            .forEach(stylesheetPaths, { .stylesheet($0) }),
            .viewport(.accordingToDevice),
            .customFavicon(),
            .unwrap(rssFeedPath, { path in
                let title = rssFeedTitle ?? "Subscribe to \(site.name)"
                return .rssFeedLink(path.absoluteString, title: title)
            }),
            .unwrap(location.imagePath ?? site.imagePath, { path in
                let url = site.url(for: path)
                return .socialImageLink(url)
            })
        )
    }
}

