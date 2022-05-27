//
//  Shell.swift
//  Studio
//
//  Created by Zef Houssney on 5/26/22.
//

import Foundation


struct Shell {

//  func shell(_ command: String) -> String {
//    Self.shell(command)
//  }
//
  // not sure why shellOut won't do a certain command
  // properly so I'm just using this directly
  static func execute(_ command: String) -> String {
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
