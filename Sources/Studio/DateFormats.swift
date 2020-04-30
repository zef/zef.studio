//
//  DateFormats.swift
//  Codextended
//
//  Created by Zef Houssney on 4/29/20.
//

import Foundation


public extension Date {
  static var yearMonthDayFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
  }()

  static var longFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateStyle = .long
    return formatter
  }()

  var yearMonthDay: String {
    return Date.yearMonthDayFormatter.string(from: self)
  }

  var long: String {
    return Date.longFormatter.string(from: self)
  }

}
