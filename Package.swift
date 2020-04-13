// swift-tools-version:5.1

import PackageDescription

let package = Package(
    name: "Studio",
    products: [
        .executable(name: "Studio", targets: ["Studio"])
    ],
    dependencies: [
        .package(url: "https://github.com/johnsundell/publish.git", from: "0.3.0"),
        .package(url: "https://github.com/hejki/sasspublishplugin", from: "0.1.0")
    ],
    targets: [
        .target(
            name: "Studio",
            dependencies: ["Publish", "SassPublishPlugin"]
        )
    ]
)
