import Foundation
import Publish
import Files
import ShellOut

struct ImageConverter {
  enum Size: Int, CaseIterable {
    case small = 1248
    case large = 3000

    func url(_ path: String) -> String {
      var parts = path.components(separatedBy: ".")
      guard let ext = parts.last, ext == "jpg" else { return path }
      parts.insert("-\(rawValue).", at: parts.count - 1)
      return parts.joined(separator: "")
    }
  }

  enum ImageType: String {
    case jpg
    case png
    case gif

    init?(extension: String) {
      switch `extension` {
      case "jpeg":
        self = .jpg
      default:
        if let type = Self(rawValue: `extension`) {
          self = type
        } else {
          return nil
        }
      }
    }
  }

  var root: Folder

  // could extract these
  var outputPath = "Resources"
  var sourcePath = "Content/images"

  func targetPath(file: File, width: Int? = nil) -> (location: Path, filename: String)? {
    guard let imageType = ImageType(extension: file.extension ?? ""),
          let location = file.parent?.path.components(separatedBy: sourcePath).last else {
      return nil
    }
    var imageSize = ""
    if let width = width {
      imageSize = "-\(width)"
    }
    let path = Path(root.path).appendingComponent(outputPath).appendingComponent(location)
    let filename = "\(file.nameExcludingExtension)\(imageSize).\(imageType)"
    return (path, filename)
  }

  func convertImages() {
    do {
      try root.subfolder(at: sourcePath).subfolders.recursive.forEach { folder in

        for file in folder.files {
          guard let imageType = ImageType(extension: file.extension ?? "") else { continue }
          switch imageType {
          case .jpg:
            createSizesForImage(file: file)
          case .png, .gif:
            copyImageToTarget(file: file)
          }
        }
      }
    } catch let error {
      fatalError("Image Conversion Error: \(error)")
    }
  }

  func createSizesForImage(file: File) {
    for size in Size.allCases {
      guard let target = targetPath(file: file, width: size.rawValue) else { continue }
      let targetPath = target.location.appendingComponent(target.filename).string

      if !fileExists(path: targetPath) {
        createFolder(at: target.location.string)

        convertImage(inputPath: file.path, targetPath: targetPath, size: size.rawValue)
      }
    }
  }

  func copyImageToTarget(file: File) {
    guard let target = targetPath(file: file) else { return }
    let targetPath = target.location.appendingComponent(target.filename).string
    let _ = shell("cp \(file.path) \(targetPath)")
  }

  // spent too long trying to do this in Swift with Files, but this is way easier
  func fileExists(path: String) -> Bool {
    do {
      try shellOut(to: "test -f \"\(path)\"")
      return true
    } catch {
      return false
    }
  }

  func createFolder(at path: String) {
    let _ = try? shellOut(to: "mkdir -p \(path)")
  }

  func convertImage(inputPath: String, targetPath: String, size: Int) {
    print("Converting image:", targetPath)

    let arguments = [
      "convert",
      "\"\(inputPath)\"",
      "-thumbnail \(size)",
      "-filter",
      "Triangle",
      "-define",
      "filter:support=2",
      "-unsharp",
      "0.25x0.25+8+0.065",
      "-dither",
      "None",
      "-posterize",
      "136",
      "-quality",
      "82",
      "-define",
      "jpeg:fancy-upsampling=off",
      "-interlace",
      "none",
      "-colorspace",
      "sRGB",
      // "-profile",
      // "/Users/zef/icc_profiles/Rec2020-Rec1886.icc",
      "-strip",
      "\"\(targetPath)\"",
    ]

    let command = arguments.joined(separator: " ")
    let _ = shell(command)
    // do {
    //   try shellOut(to: arguments)
    //   print("Converted \(targetPath)")
    // } catch let error {
    //   print("Image conversion failed...", error)
    // }
  }

  static func sizeForImage(file: String) -> (width: Int, height: Int) {
    let identifyOutput = shell("identify -format \"%wx%h\" \"\(file)\"")
    let size = identifyOutput.components(separatedBy: "x")

    guard let width = Int(size.first ?? ""), let height = Int(size.last ?? "") else {
      // fatalError("Unexpected data encountered in sizeForImage. \(identifyOutput)")
      print("ERROR: Could not get data in sizeForImage. The image doesn't exist yet, or is incorrectly named, regenerate the project.")
      return (0,0)
    }
    return (width, height)
  }


  func shell(_ command: String) -> String {
    Self.shell(command)
  }

  // not sure why shellOut won't do this one properly
  // so I'm just using this directly
  static func shell(_ command: String) -> String {
      let task = Process()
      let pipe = Pipe()

      task.standardOutput = pipe
      task.standardError = pipe
      task.arguments = ["-c", command]
      task.launchPath = "/bin/zsh"
      task.launch()

      let data = pipe.fileHandleForReading.readDataToEndOfFile()
      let output = String(data: data, encoding: .utf8)!

      return output
  }

}
