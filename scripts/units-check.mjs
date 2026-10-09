#!/usr/bin/env node
// Checks the unit conversions the customizer types and reads through.
//
//   node scripts/units-check.mjs
//
// Pure arithmetic and string formatting with no DOM behind it, which makes it
// the one part of the frontend worth checking this way — and the kind of thing
// that goes wrong quietly. A fraction that doesn't survive being written into
// a box and read back out is a value drifting every time someone edits it.
import {
  counterpart,
  followsPageUnit,
  forInput,
  mmFrom,
  mmToStored,
  parseTyped,
  stepIn,
  storedToMm,
} from "../frontend/javascript/scad/units.js"

let failures = 0

function is(label, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) return
  failures += 1
  console.log(`  \x1b[31m✗\x1b[0m ${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`)
}

function section(name, body) {
  console.log(`\n  ${name}`)
  body()
}

section("inches, written the way people write them", () => {
  for (const [text, want] of [
    ["1/8", 0.125],
    ["3/16", 0.1875],
    ["1 3/8", 1.375],
    ["1-3/8", 1.375],
    [".25", 0.25],
    ["2", 2],
    ['1/2"', 0.5],
    ["3/16″", 0.1875],
    ["1 1/2 in", 1.5],
    ["-1/4", -0.25],
    ["1/0", null],
    ["banana", null],
    ["", null],
  ]) {
    is(`parse ${JSON.stringify(text)}`, parseTyped(text, "inch"), want)
  }
})

section("millimetres take no fractions", () => {
  is("4.76", parseTyped("4.76", "mm"), 4.76)
  is("10 mm", parseTyped("10 mm", "mm"), 10)
  is("3/16 is not a millimetre", parseTyped("3/16", "mm"), null)
})

section("what lands in the input box", () => {
  is("3.175 mm", forInput(3.175, "inch"), "1/8")
  is("4.7625 mm", forInput(4.7625, "inch"), "3/16")
  is("34.925 mm", forInput(34.925, "inch"), "1 3/8")
  is("25.4 mm", forInput(25.4, "inch"), "1")
  is("2.778125 mm — finer than a reading, still exact", forInput(2.778125, "inch"), "7/64")
  is("4.7 mm has no tidy fraction", forInput(4.7, "inch"), "0.185")
  is("100 mm keeps its zeros", forInput(100, "mm"), "100")
  is("4.7625 mm", forInput(4.7625, "mm"), "4.7625")
})

section("the reading beside the box", () => {
  is("exact fraction goes bare", counterpart(4.7625, "mm").text, "3/16″")
  is("a rounding is marked", counterpart(4.7, "mm").text, "≈ 3/16″")
  is("and offers the real number", counterpart(4.7, "mm").snap, { mm: 4.7625, label: "3/16″" })
  is("an exact one offers nothing", counterpart(4.7625, "mm").snap, null)
  is("too fine to read as a fraction", counterpart(2.778125, "mm").text, "0.109″")
  is("working in inches reads millimetres", counterpart(12.7, "inch").text, "12.7 mm")
  is("millimetres are never a rounding", counterpart(12.3456, "inch").snap, null)
})

section("slider steps land on rule markings", () => {
  is("0.1 mm stays 0.1 mm", stepIn("mm", 0.1), 0.1)
  is("0.1 mm becomes 1/64in", stepIn("inch", 0.1), 1 / 64)
  is("1 mm becomes 1/32in", stepIn("inch", 1), 1 / 32)
  is("5 mm becomes 1/4in", stepIn("inch", 5), 1 / 4)
})

section("typed, stored, and read back unchanged", () => {
  for (const text of ["1/8", "3/16", "1 3/8", "7/64", "1/64", "0.125"]) {
    const typed = parseTyped(text, "inch")
    const back = parseTyped(forInput(mmFrom(typed, "inch"), "inch"), "inch")
    is(`${text} survives the round trip`, Math.abs(back - typed) < 1e-9, true)
  }
})

section("a model that stores inches of its own", () => {
  const caliber = { type: "number", unit: "inch" }
  is(".50 cal in millimetres", storedToMm(0.5, caliber), 12.7)
  is("and back", mmToStored(12.7, caliber), 0.5)
  is("a millimetre parameter is untouched", storedToMm(10, { type: "number", unit: "mm" }), 10)
})

section("what the page switch may move", () => {
  is("an assumed unit follows", followsPageUnit({ type: "number", unit: "mm" }), true)
  is("a declared one is pinned", followsPageUnit({ type: "number", unit: "mm", unit_declared: true }), false)
  is("so is a declared inch", followsPageUnit({ type: "number", unit: "inch", unit_declared: true }), false)
  is("a count has no units", followsPageUnit({ type: "number", unit: "count" }), false)
  is("nor has a string", followsPageUnit({ type: "string" }), false)
})

console.log(failures ? `\n  \x1b[31m${failures} failed\x1b[0m\n` : "\n  \x1b[32mall good\x1b[0m\n")
process.exit(failures ? 1 : 0)
