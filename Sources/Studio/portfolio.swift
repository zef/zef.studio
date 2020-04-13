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

  static var all: [Client] {
    [
      Client(name: "Disney Movies Anywhere",
             link: "https://en.wikipedia.org/wiki/Movies_Anywhere",
             description: """
On Disney Movies Anywhere, I worked on a small team to build and architect application from scratch on a tight timeline. Interacted with Disney APIs, integrated internal and third-party libraries. We shipped a great app on time, and I continued to work on it throughout its entire lifetime, until it was retired and replaced by Movies Anywhere.
"""),
      Client(name: "Movies Anywhere",
             link: "https://apps.apple.com/us/app/movies-anywhere/id1245330908",
        description: """
Worked with a small team to build Movies Anywhere from scratch. Worked with backend teams to determine approaches for the architecture of app and server interaction. Conceptualized and implemented iOS architecture.

We launched in a high traffic environment with a lot of users, yet an extremely low crash rate.
"""),
      Client(name: "Fitz Frames",
             link: "https://apps.apple.com/us/app/fitz-glasses/id1451230309",
             description: """
            I was brought in to lead a team of developers in creating a solid foundation for this new app. A key part of this app was the use of ARKit and other iOS Vision libraries to measure facial features of children in order to create perfectly-fitting custom glasses, and virtual try-on. After the conclusion of my contract, the team went on to successfully launch the app.
"""),

    ]
  }
}

extension Node where Context == HTML.BodyContext {
  static func portfolio(for clients: [Client]) -> Node {
    .group([
      .div(
        .h1("Clients"),
        .p("Here's a selection of some of the work I've done for clients.")
      ),
      .ul(
        .class("item-list"),
        .forEach(clients) { client in
          .li(
            .h1(.a(
              .href(client.link),
              .text(client.name)
              )),
            .img(.src(client.image)),
            .p(.text(client.description))
          )
        }
      )
    ])
  }
}

