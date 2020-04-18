import Foundation
import Publish
import Plot

struct Client {
  let name: String
  let link: String
  let description: String


  var image: String {
    "\(name.lowercased().replacingOccurrences(of: " ", with: "-")).png"
  }

  var paragraphs: [String] {
    description.components(separatedBy: "\n").filter { !$0.isEmpty }
  }

  var icons: [(image: String, name: String, link: String)] {
    switch name {
    case "About Me":
        return [("swift.png", "", link)]
    case "Exceed by Money Network":
      return [
        (image, "Exceed Card", link),
        ("money-network.png", "Money Network", "https://apps.apple.com/us/app/money-network-mobile-app/id616090626"),
      ]
    case "News Corp Apps":
      return [
        ("the-australian.png", "The Australian", "https://apps.apple.com/us/app/the-australian/id369849696"),
        ("nyp.png", "New York Post", "https://apps.apple.com/us/app/new-york-post-for-iphone/id410094240"),
        ("page-six.png", "Page Six", "https://apps.apple.com/us/app/page-six-for-iphone/id1265171678"),
      ]
    default:
      return [
        (image, name, link)
      ]
    }
  }

  static var all: [Client] {
    [
      Client(name: "About Me",
             link: "https://swift.org",
             description: """
Hello! My name is Zef, and I'm passionate about creating excellent software.

I've been working as a freelance software engineer since 2009, and my software has been used by millions of people around the world. I seek to deliver excellent value by providing great code, team leadership, and insight in design, user-experience, and business value.

In addition to working with code, I'm great at working with clients and designers. I am skilled in clear communication with people from all backgrounds.

<a href="/portfolio/zef-houssney-resume.pdf">Download my Resume</a> to learn about my specific skills, check out some of my work on <a href="https://github.com/zef">GitHub</a>, and write me at <a href="mailto:zef@zef.studio">zef@zef.studio</a>.

I specialize in native iOS application development, but I also have extensive experience with and knowledge of web development, which informs my work and helps me to be a great iOS developer, too.

Here's a selection of some of the iOS work I've done for clients.
"""),

      Client(name: "Disney Movies Anywhere",
             link: "https://en.wikipedia.org/wiki/Movies_Anywhere",
      description: """
On Disney Movies Anywhere, I worked on a small team to build and architect this high-profile application from scratch, and on a tight timeline. I interacted with Disney APIs, integrating internal and third-party libraries. I also worked with Apple on our system-level iTunes account linking feature.

We shipped a great app on time, and I continued to work on it throughout its entire lifetime — eventually taking over leadership of the iOS team — until it was replaced by Movies Anywhere in 2017, and then eventually retired.
"""),
      Client(name: "Movies Anywhere",
             link: "https://apps.apple.com/us/app/movies-anywhere/id1245330908",
      description: """
I worked with and helped lead a small team to build <a href="https://moviesanywhere.com">Movies Anywhere</a> from scratch. Worked with backend teams and frontend teams for other platforms to determine approaches for the architecture of app and server interaction. Conceptualized and implemented iOS architecture, which included the use of GraphQL and the Realm database.

We launched into a high traffic environment, yet maintained an extremely low crash rate from launch day forward. I continued to work with the team at Movies Anywhere after launch, eventually interviewing, hiring, and onboarding new team members as the team transitioned to only full-time, on-site employees

When wrapping up this project, my good friend Aaron said something really nice about me:

<blockquote class="twitter-tweet" data-theme="light"><p lang="en" dir="ltr">Between you and me, Zef’s game is the tightest I’ve seen. You want the best, you get Zef. <a href="https://t.co/Tr0r7S9DTH">https://t.co/Tr0r7S9DTH</a></p>&mdash; Aaron Vegh (@🏡) (@aaronvegh) <a href="https://twitter.com/aaronvegh/status/959263590028070913?ref_src=twsrc%5Etfw">February 2, 2018</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
"""),

      Client(name: "Fitz Frames",
             link: "https://apps.apple.com/us/app/fitz-glasses/id1451230309",
      description: """
I was brought in to lead a team of developers in creating a solid foundation for the <a href="https://www.fitzframes.com">Fitz Frames</a> iOS app.

A key part of this app was the use of ARKit and other iOS Vision libraries to facilitate virtual try-on, and to measure facial features of children in order to create perfectly-fitting custom glasses. After the conclusion of my contract, the team went on to successfully launch the app.
"""),

      Client(name: "Planetary",
             link: "https://planetary.social",
      description: """
<a href="https://planetary.social">Planetary</a> — currently in beta — is a new social network built on a distributed, open foundation. I came in to help accelerate the development of the app by lending a hand to the solo developer who had started the project. My primary goal was to refine and to improve polish in the app, fixing bugs along the way.

I also got to implement a fun custom dynamic animation of the icon in their logo for use as a connectivity indicator inside the app. The number of balls on each of the circles is dynamic, indicating the number of connected peers, spinning, changing color to represent connection state, and smoothly animating changes to the real data.
"""),

      Client(name: "Boomerang",
             link: "https://apps.apple.com/us/app/boomerang-cartoons-movies/id1199519834",
      description: """
Worked on iOS and tvOS apps for <a href="https://www.boomerang.com">Boomerang</a>. This included a major redesign, feature development, and bug fixing, resulting in a major improvement to the user interface — modernizing design, improving the user experience, and improving reliability.
"""),

      Client(name: "DC Universe",
             link: "https://apps.apple.com/us/app/dc-universe/id1329018000",
      description: """
Worked with a team of developers on the <a href="https://www.dcuniverse.com">DC Universe</a> iOS app, assisting with bug fixing and feature development. This included work on user interface consistency and theming, deep link handling, and analytics.
"""),

      Client(name: "Marvel Unlimited",
             link: "https://apps.apple.com/us/app/marvel-unlimited/id607205403",
             description: """
Helped implement a new native comic reader for <a href="http://marvelunlimited.com">Marvel Unlimited</a> on a tight deadline. This was an interesting and challenging project, allowing comics to be displayed in various ways, including smooth animations between comic panels that share a page.
"""),

      Client(name: "Exceed by Money Network",
             link: "https://apps.apple.com/us/app/exceed-by-money-network/id1455259057",
             description: """
Implemented an aggressive user interface redesign and rebranding in a challenging legacy codebase that was mixed between Objective-C and Swift.

I was able to significantly improve the maintainability and consistency of the codebase, fixing some previously-unidentified bugs along the way.
"""),

      Client(name: "News Corp Apps",
             link: "https://apps.apple.com/us/app/exceed-by-money-network/id1455259057",
             description: """
Helped a team work on bug fixing and feature development. Worked on debugging and fixing some challenging layout issues, making sure that complex layouts would be properly rendered on screens of all sizes and configurations.
"""),
      Client(name: "Univision",
             link: "https://apps.apple.com/us/app/univision-app/id425226754",
      description: """
Helped accelerate the progress of a team to meet a deadline. Implemented a dynamic system for the settings screen, and worked on a great first-launch experience.
""")

    ]
  }
}

extension Node where Context == HTML.BodyContext {
  static func portfolio(for clients: [Client]) -> Node {
    .group([
      .ul(
        .class("item-list"),
        .forEach(clients) { client in
          .li(
            .div(.class("headline-container"),
              .h1(.text(client.name))
            ),
            .div(.class("item-description"),
              .ul(
                .forEach(client.icons) { icon in
                  .li(
                    .a(.class("app-icon"),
                       .element(named: "figure", nodes: [
                        .img(.src("/portfolio/\(icon.image)")),
                        .element(named: "figcaption", text: icon.name)
                       ]),
                       .href(icon.link)
                    )
                  )
                }
              ),
              .div(
                .forEach(client.paragraphs) { section in
                  .p(.raw(section))
                }
              )
            )
          )
        }
      )
    ])
  }
}

