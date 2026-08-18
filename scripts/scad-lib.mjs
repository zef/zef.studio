// Node-side glue for the render kernel: reads the vendored assets straight off
// disk so scripts render models with the identical code path the website uses.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { OpenSCADKernel } from "../frontend/javascript/scad/kernel.js"

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
export const assetDir = path.join(root, "src", "3d-printing")
export const modelDir = path.join(assetDir, "models")

export const nodeAssets = {
  moduleUrl: (rel) => pathToFileURL(path.join(assetDir, rel)).href,
  bytes: async (rel) => new Uint8Array(fs.readFileSync(path.join(assetDir, rel))),
  text: async (rel) => fs.readFileSync(path.join(assetDir, rel), "utf8"),
}

export function createKernel() {
  return new OpenSCADKernel({ assets: nodeAssets })
}

/** Lists the model slugs that have a .scad source. */
export function modelSlugs() {
  if (!fs.existsSync(modelDir)) return []
  return fs
    .readdirSync(modelDir)
    .filter((f) => f.endsWith(".scad"))
    .map((f) => f.replace(/\.scad$/, ""))
    .sort()
}

export function readModel(slug) {
  const scad = path.join(modelDir, `${slug}.scad`)
  if (!fs.existsSync(scad)) throw new Error(`No model source at ${scad}`)
  const presetFile = path.join(modelDir, `${slug}.json`)
  const presets = fs.existsSync(presetFile) ? JSON.parse(fs.readFileSync(presetFile, "utf8")) : null
  return { slug, source: fs.readFileSync(scad, "utf8"), presets, path: scad }
}

/** Reads the `// scad-web:` directives a model uses to declare its needs. */
export function modelDirectives(source) {
  const directives = { libraries: [], fonts: false, features: null }
  for (const line of source.split("\n")) {
    const m = line.match(/^\s*\/\/\s*scad-web:\s*(\w+)\s*=\s*(.+?)\s*$/)
    if (!m) continue
    const [, key, raw] = m
    if (key === "libraries") directives.libraries = raw.split(/[,\s]+/).filter(Boolean)
    else if (key === "fonts") directives.fonts = raw === "true"
    else if (key === "features") directives.features = raw.split(/[,\s]+/).filter(Boolean)
  }
  // Fall back to sniffing includes so a model works even without directives.
  if (!directives.libraries.length && /include\s*<BOSL2\//.test(source)) directives.libraries = ["BOSL2"]
  if (!directives.fonts && /\btext\s*\(|path_text\s*\(/.test(source)) directives.fonts = true
  return directives
}

/** Triangle count and bounding box of a binary STL, for sanity checks. */
export function inspectSTL(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const triangles = view.getUint32(80, true)
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let t = 0; t < triangles; t++) {
    const base = 84 + t * 50 + 12
    for (let v = 0; v < 3; v++) {
      for (let axis = 0; axis < 3; axis++) {
        const value = view.getFloat32(base + v * 12 + axis * 4, true)
        if (value < min[axis]) min[axis] = value
        if (value > max[axis]) max[axis] = value
      }
    }
  }
  return {
    triangles,
    min,
    max,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  }
}
