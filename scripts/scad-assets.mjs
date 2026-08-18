#!/usr/bin/env node
// Vendors the assets the in-browser OpenSCAD customizer needs:
//
//   * the OpenSCAD WebAssembly build (the actual geometry kernel)
//   * the BOSL2 library, comment-stripped and packed into one JSON file
//   * a font, so models that emboss text have something to render with
//
// Everything it produces is committed to the repo, so a normal site build
// never touches the network. Re-run this only to update a vendored version:
//
//   node scripts/scad-assets.mjs            # refresh anything missing
//   node scripts/scad-assets.mjs --force    # re-fetch everything
//   node scripts/scad-assets.mjs --bosl2-from ~/Documents/OpenSCAD/libraries/BOSL2
//
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const dest = path.join(root, "src", "3d-printing")

// Pinned upstream versions. Bump these deliberately — a new OpenSCAD build can
// change geometry output, and every model on the site is rendered by it.
const SOURCES = {
  wasm: {
    version: "2025.03.25.wasm24456",
    url: "https://files.openscad.org/playground/OpenSCAD-2025.03.25.wasm24456-WebAssembly-web.zip",
  },
  bosl2: {
    version: "v2.0.751",
    repo: "https://github.com/BelfrySCAD/BOSL2.git",
  },
  font: {
    version: "2.37",
    url: "https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.zip",
    // DejaVu Sans is fontconfig's usual default, so `text()` calls that don't
    // name a font behave the same here as they do in desktop OpenSCAD. Bold and
    // Mono are here because embossed lettering reads better with heavier strokes.
    files: ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf", "DejaVuSansMono.ttf"],
  },
}

const force = process.argv.includes("--force")
const bosl2From = argValue("--bosl2-from")

function argValue(flag) {
  const i = process.argv.indexOf(flag)
  return i === -1 ? null : process.argv[i + 1]
}

function log(step, msg) {
  console.log(`  \x1b[36m${step.padStart(10)}\x1b[0m  ${msg}`)
}

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"], ...opts })
}

async function download(url, file) {
  const res = await fetch(url, { redirect: "follow" })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  return file
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16)
}

function mb(bytes) {
  return `${(bytes / 1e6).toFixed(2)} MB`
}

// Strips comments from OpenSCAD source without touching string literals.
// BOSL2 ships as ~60% documentation comments, so this is most of the win.
export function stripScad(source) {
  let out = ""
  let i = 0
  const n = source.length
  while (i < n) {
    const c = source[i]
    if (c === '"') {
      // copy the string literal verbatim, honoring backslash escapes
      out += c
      i++
      while (i < n) {
        if (source[i] === "\\" && i + 1 < n) {
          out += source.slice(i, i + 2)
          i += 2
        } else if (source[i] === '"') {
          out += source[i]
          i++
          break
        } else {
          out += source[i]
          i++
        }
      }
    } else if (c === "/" && source[i + 1] === "/") {
      while (i < n && source[i] !== "\n") i++
    } else if (c === "/" && source[i + 1] === "*") {
      i += 2
      while (i + 1 < n && !(source[i] === "*" && source[i + 1] === "/")) i++
      i += 2
      out += " " // keep tokens on either side from fusing together
    } else {
      out += c
      i++
    }
  }
  return out
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .filter((line) => line.trim() !== "")
    .join("\n")
}

// Follows include/use statements to find the subset of a library actually
// reachable from the given entry points, so we don't ship files no model loads.
function reachableFrom(dir, entries) {
  const seen = new Set()
  const stack = [...entries]
  while (stack.length) {
    const name = stack.pop()
    if (seen.has(name)) continue
    seen.add(name)
    const file = path.join(dir, name)
    if (!fs.existsSync(file)) continue
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*(?:include|use)\s*<(?:BOSL2\/)?([^>]+)>/)
      if (m) stack.push(m[1])
    }
  }
  return [...seen].filter((f) => fs.existsSync(path.join(dir, f)))
}

async function vendorWasm() {
  const dir = path.join(dest, "runtime")
  if (!force && fs.existsSync(path.join(dir, "openscad.wasm"))) {
    return log("runtime", "already vendored (use --force to refresh)")
  }
  fs.mkdirSync(dir, { recursive: true })
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "scad-wasm-"))
  const zip = path.join(tmp, "openscad.zip")
  log("runtime", `downloading OpenSCAD ${SOURCES.wasm.version}…`)
  await download(SOURCES.wasm.url, zip)
  sh("unzip", ["-o", "-q", zip, "-d", tmp])
  for (const name of ["openscad.js", "openscad.wasm"]) {
    fs.copyFileSync(path.join(tmp, name), path.join(dir, name))
    const size = fs.statSync(path.join(dir, name)).size
    log("runtime", `${name} — ${mb(size)}`)
  }
  fs.rmSync(tmp, { recursive: true, force: true })
}

async function vendorBosl2() {
  const out = path.join(dest, "libraries", "bosl2.json")
  if (!force && fs.existsSync(out)) {
    return log("BOSL2", "already vendored (use --force to refresh)")
  }
  fs.mkdirSync(path.dirname(out), { recursive: true })

  let src = bosl2From
  let tmp = null
  if (!src) {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bosl2-"))
    log("BOSL2", `cloning ${SOURCES.bosl2.version}…`)
    sh("git", ["clone", "--depth", "1", "--branch", SOURCES.bosl2.version, SOURCES.bosl2.repo, tmp])
    src = tmp
  }
  log("BOSL2", `packing from ${src}`)

  // std.scad is the umbrella include; the rest are opt-in modules that models
  // on this site actually reach for.
  const entries = [
    "std.scad", "screws.scad", "threading.scad", "gears.scad", "fnliterals.scad",
    "turtle3d.scad", "hinges.scad", "joiners.scad", "walls.scad", "nema_steppers.scad",
    "modular_hose.scad", "bottlecaps.scad", "wiring.scad", "rounding.scad", "metric_screws.scad",
    "polyhedra.scad", "cubetruss.scad", "sliders.scad", "ball_bearings.scad",
  ].filter((f) => fs.existsSync(path.join(src, f)))

  const files = reachableFrom(src, entries)
  const pack = {}
  let raw = 0
  for (const name of files.sort()) {
    const source = fs.readFileSync(path.join(src, name), "utf8")
    raw += Buffer.byteLength(source)
    pack[name] = stripScad(source)
  }
  // The license has to travel with the library.
  for (const license of ["LICENSE", "LICENSE.txt"]) {
    if (fs.existsSync(path.join(src, license))) {
      pack[license] = fs.readFileSync(path.join(src, license), "utf8")
      break
    }
  }
  const json = JSON.stringify(pack)
  fs.writeFileSync(out, json)
  log("BOSL2", `${files.length} files, ${mb(raw)} → ${mb(Buffer.byteLength(json))} stripped`)
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true })
}

async function vendorFonts() {
  const dir = path.join(dest, "fonts")
  const first = path.join(dir, SOURCES.font.files[0])
  if (!force && fs.existsSync(first)) {
    return log("fonts", "already vendored (use --force to refresh)")
  }
  fs.mkdirSync(dir, { recursive: true })
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "scad-fonts-"))
  const zip = path.join(tmp, "fonts.zip")
  log("fonts", `downloading DejaVu Sans ${SOURCES.font.version}…`)
  await download(SOURCES.font.url, zip)
  sh("unzip", ["-o", "-q", zip, "-d", tmp])
  for (const name of SOURCES.font.files) {
    const found = sh("find", [tmp, "-name", name]).toString().trim().split("\n")[0]
    if (!found) throw new Error(`${name} not found in font archive`)
    fs.copyFileSync(found, path.join(dir, name))
    log("fonts", `${name} — ${mb(fs.statSync(path.join(dir, name)).size)}`)
  }
  const license = sh("find", [tmp, "-name", "LICENSE"]).toString().trim().split("\n")[0]
  if (license) fs.copyFileSync(license, path.join(dir, "LICENSE"))
  fs.rmSync(tmp, { recursive: true, force: true })
}

// A manifest of what's vendored, so it's obvious what version the site is on
// and whether a file changed underneath us.
function writeManifest() {
  const entries = {}
  for (const rel of [
    "runtime/openscad.js", "runtime/openscad.wasm",
    "libraries/bosl2.json",
    ...SOURCES.font.files.map((f) => `fonts/${f}`),
  ]) {
    const file = path.join(dest, rel)
    if (!fs.existsSync(file)) continue
    const buf = fs.readFileSync(file)
    entries[rel] = { bytes: buf.length, sha256: sha256(buf) }
  }
  const manifest = {
    generatedBy: "scripts/scad-assets.mjs",
    openscad: SOURCES.wasm.version,
    bosl2: bosl2From ? `local (${bosl2From})` : SOURCES.bosl2.version,
    font: `DejaVu ${SOURCES.font.version}`,
    files: entries,
  }
  fs.writeFileSync(path.join(dest, "ASSETS.json"), `${JSON.stringify(manifest, null, 2)}\n`)
  log("manifest", "wrote src/3d-printing/ASSETS.json")
}

console.log("\nVendoring OpenSCAD customizer assets\n")
await vendorWasm()
await vendorBosl2()
await vendorFonts()
writeManifest()
console.log("\nDone.\n")
