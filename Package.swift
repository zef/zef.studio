// swift-tools-version:5.4

import PackageDescription

let package = Package(
    name: "Studio",
    products: [
      .executable(
        name: "Studio",
        targets: ["Studio"])
    ],
    dependencies: [
        .package(name: "Publish", url: "https://github.com/johnsundell/publish.git", from: "0.8.0"),
        // .package(name: "SassPublishPlugin", url: "https://github.com/hejki/sasspublishplugin", from: "0.1.0")
    ],
    targets: [
        .executableTarget(
            name: "Studio",
            dependencies: [
                "Publish",
                // "SassPublishPlugin"
            ]
        )
    ]
)
