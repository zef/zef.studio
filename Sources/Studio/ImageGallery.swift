import Foundation

struct ImageGallery {

  var body: String
  var basePath: String

  var bodyWithGallery: String {
    return body + imageGallery
  }


  struct ImageData: Codable {
    var path: String
    var placeholderPath: String
    var width: Int
    var height: Int
    var caption: String?

    enum CodingKeys: String, CodingKey {
        case path = "src"
        case placeholderPath = "msrc"
        case width = "w"
        case height = "h"
        case caption = "title"
    }
  }

  var imageGallery: String {
    var images = [ImageData]()

    // matches:
    // 1: large image
    // 2: small image
    // 3: figcaption tag, optional
    // 4: caption, optional
    guard let regex = try? NSRegularExpression(pattern: #"<figure><a href="(.+?)".*?src="(.+?)".*?(<figcaption>(.+?)<\/figcaption>)?<\/figure>"#, options: []) else { fatalError() }

    let range = NSRange(body.startIndex..<body.endIndex, in: body)
    regex.enumerateMatches(in: body, options: [], range: range) { (match, _, _) in
      guard let match = match,
            let pathRange = Range(match.range(at: 1), in: body),
            let smallPathRange = Range(match.range(at: 2), in: body) else {
              print("Matches not found in image gallery...")
              return
            }

      let path = String(body[pathRange])
      let smallPath = String(body[smallPathRange])

      let fullPath = "\(basePath)/\(path)"
      let size = ImageConverter.sizeForImage(file: fullPath)

      var caption: String? = nil

      if let captionRange = Range(match.range(at: 4), in: body) {
        caption = String(body[captionRange])
      }

      images.append(ImageData(path: path, placeholderPath: smallPath, width: size.width, height: size.height, caption: caption))
    }

    let data = """
    <script>
      ready(function() {
        window.pswpSlides = \(images.toJSON);
      });
    </script>
    """

    return data
  }

}

extension Array where Element == ImageGallery.ImageData {
  var toJSON: String {
    guard let jsonData = try? JSONEncoder().encode(self),
    let jsonString = String(data: jsonData, encoding: .utf8) else {
      fatalError("ImageData: JSON encoding failed. \(self)")
    }
    return jsonString
  }
}
