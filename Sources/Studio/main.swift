import Foundation
import Publish
import Plot

// This type acts as the configuration for your website.
struct Studio: Website {
    enum SectionID: String, WebsiteSectionID {
        // Add the sections that you want your website to contain here:
        case posts
        case Portfolio
    }

    struct ItemMetadata: WebsiteItemMetadata {
        // Add any site-specific metadata that you want to use here.
    }

    // Update these properties to configure your website:
    var url = URL(string: "https://zef.studio")!
    var name = "Zef Houssney"
    var description = "My name is Zef. Welcome to my website."
    var language: Language { .english }
    var imagePath: Path? { nil }
}

try Studio().publish(withTheme: .studio)
