#!/usr/bin/env node
// Renders each model to a shaded PNG for the index grid.
//
//   node scripts/scad-preview.mjs            # every model
//   node scripts/scad-preview.mjs tile-spacer --size 900
//
// This is a small software rasterizer rather than a headless GPU: a z-buffer,
// flat shading and 3x supersampling. That's plenty for a thumbnail, and it
// means generating previews needs nothing but Node.
import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"

import { assetDir, createKernel, modelDirectives, modelParts, modelSlugs, readModel } from "./scad-lib.mjs"
// The same row-and-gap rule the viewer uses, so the thumbnail and the
// interactive view arrange a kit the same way round.
import { layoutParts } from "../frontend/javascript/scad/parts.js"

const argv = process.argv.slice(2)
const flagValue = (name, fallback) => {
  const i = argv.indexOf(name)
  return i === -1 ? fallback : Number(argv[i + 1])
}

const SIZE = flagValue("--size", 800)
const SUPERSAMPLE = 3
const OUT_DIR = path.join(assetDir, "previews")

// Site palette, so the grid sits in the page rather than on top of it.
const MODEL_COLOR = [0x4a, 0x6d, 0xa8]
const BACKGROUND = [0, 0, 0, 0] // transparent; the page supplies the paper

// ---------------------------------------------------------------- geometry

function trianglesFromSTL(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint32(80, true)
  const positions = new Float32Array(count * 9)
  const normals = new Float32Array(count * 3)
  for (let t = 0; t < count; t++) {
    const base = 84 + t * 50
    for (let a = 0; a < 3; a++) normals[t * 3 + a] = view.getFloat32(base + a * 4, true)
    for (let v = 0; v < 3; v++) {
      for (let a = 0; a < 3; a++) {
        positions[t * 9 + v * 3 + a] = view.getFloat32(base + 12 + v * 12 + a * 4, true)
      }
    }
  }
  return { count, positions, normals }
}

/** Bounds of a parsed STL, in the shape layoutParts expects. */
function withBounds(geometry) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < geometry.count * 3; i++) {
    for (let axis = 0; axis < 3; axis++) {
      const value = geometry.positions[i * 3 + axis]
      if (value < min[axis]) min[axis] = value
      if (value > max[axis]) max[axis] = value
    }
  }
  return {
    ...geometry,
    bounds: { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] },
  }
}

/** Lays several parts out in a row and welds them into one mesh to draw. */
function combineParts(pieces) {
  if (pieces.length === 1) return pieces[0].geometry

  const placed = layoutParts(pieces)
  const count = placed.reduce((sum, piece) => sum + piece.geometry.count, 0)
  const positions = new Float32Array(count * 9)
  // Normals here are one per triangle rather than per vertex, and the layout
  // only translates, so they carry over as they are.
  const normals = new Float32Array(count * 3)

  let vertex = 0
  let triangle = 0
  for (const { geometry, offset } of placed) {
    normals.set(geometry.normals, triangle * 3)
    for (let i = 0; i < geometry.count * 3; i++) {
      for (let axis = 0; axis < 3; axis++) {
        positions[(vertex + i) * 3 + axis] = geometry.positions[i * 3 + axis] + offset[axis]
      }
    }
    vertex += geometry.count * 3
    triangle += geometry.count
  }
  return { count, positions, normals }
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

/**
 * Orthonormal camera basis for a three-quarter view of a Z-up model.
 * `eye` is the direction from the model toward the camera, so a face is
 * visible when its outward normal has a positive dot product with it.
 */
function viewBasis(yawDeg, pitchDeg) {
  const yaw = (yawDeg * Math.PI) / 180
  const pitch = (pitchDeg * Math.PI) / 180
  // Right of, in front of, and above the part.
  const eye = normalize([
    Math.sin(yaw) * Math.cos(pitch),
    -Math.cos(yaw) * Math.cos(pitch),
    Math.sin(pitch),
  ])
  const right = normalize(cross([0, 0, 1], eye))
  const up = normalize(cross(eye, right))
  return { right, up, eye }
}

// ------------------------------------------------------------- rasterizer

function render(geometry, size) {
  const width = size
  const height = size
  const color = new Float32Array(width * height * 3)
  const alpha = new Float32Array(width * height)
  const depth = new Float32Array(width * height).fill(Infinity)

  const { right, up, eye } = viewBasis(35, 26)

  // Project every vertex, then scale so the model fills the frame.
  const n = geometry.count * 3
  const view = new Float32Array(n * 3)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (let i = 0; i < n; i++) {
    const p = [geometry.positions[i * 3], geometry.positions[i * 3 + 1], geometry.positions[i * 3 + 2]]
    const x = dot(p, right)
    const y = dot(p, up)
    // Negated so smaller depth means nearer the camera.
    const z = -dot(p, eye)
    view[i * 3] = x
    view[i * 3 + 1] = y
    view[i * 3 + 2] = z
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  const margin = 0.92
  const scale = Math.min(width / (maxX - minX || 1), height / (maxY - minY || 1)) * margin
  const offsetX = width / 2 - ((minX + maxX) / 2) * scale
  const offsetY = height / 2 + ((minY + maxY) / 2) * scale

  // The camera sits at -Y, so the lights belong on that side of the model too.
  // Key over the viewer's left shoulder, fill from the lower right to keep the
  // shadowed faces from going flat black.
  const key = normalize([-0.40, -0.60, 0.72])
  const fill = normalize([0.75, -0.35, 0.15])

  for (let t = 0; t < geometry.count; t++) {
    const i0 = t * 3, i1 = t * 3 + 1, i2 = t * 3 + 2
    const ax = view[i0 * 3] * scale + offsetX, ay = offsetY - view[i0 * 3 + 1] * scale, az = view[i0 * 3 + 2]
    const bx = view[i1 * 3] * scale + offsetX, by = offsetY - view[i1 * 3 + 1] * scale, bz = view[i1 * 3 + 2]
    const cx = view[i2 * 3] * scale + offsetX, cy = offsetY - view[i2 * 3 + 1] * scale, cz = view[i2 * 3 + 2]

    // STL facet normals are occasionally zeroed out, so derive from the winding.
    const normal = normalize(cross(
      sub([geometry.positions[i1 * 3], geometry.positions[i1 * 3 + 1], geometry.positions[i1 * 3 + 2]],
          [geometry.positions[i0 * 3], geometry.positions[i0 * 3 + 1], geometry.positions[i0 * 3 + 2]]),
      sub([geometry.positions[i2 * 3], geometry.positions[i2 * 3 + 1], geometry.positions[i2 * 3 + 2]],
          [geometry.positions[i0 * 3], geometry.positions[i0 * 3 + 1], geometry.positions[i0 * 3 + 2]])
    ))

    // Cull by the normal rather than the screen winding — no sign ambiguity.
    if (dot(normal, eye) <= 0) continue

    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    if (area === 0) continue

    const lit = 0.34 + 0.66 * Math.max(0, dot(normal, key)) + 0.24 * Math.max(0, dot(normal, fill))

    const loX = Math.max(0, Math.floor(Math.min(ax, bx, cx)))
    const hiX = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)))
    const loY = Math.max(0, Math.floor(Math.min(ay, by, cy)))
    const hiY = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)))
    const inv = 1 / area

    for (let y = loY; y <= hiY; y++) {
      for (let x = loX; x <= hiX; x++) {
        const px = x + 0.5, py = y + 0.5
        const w0 = ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) * inv
        const w1 = ((cx - bx) * (py - by) - (cy - by) * (px - bx)) * inv
        const w2 = ((ax - cx) * (py - cy) - (ay - cy) * (px - cx)) * inv
        if (w0 < 0 || w1 < 0 || w2 < 0) continue
        // Barycentric weights are rotated one step relative to the vertices.
        const z = w1 * az + w2 * bz + w0 * cz
        const idx = y * width + x
        if (z >= depth[idx]) continue
        depth[idx] = z
        color[idx * 3] = MODEL_COLOR[0] * lit
        color[idx * 3 + 1] = MODEL_COLOR[1] * lit
        color[idx * 3 + 2] = MODEL_COLOR[2] * lit
        alpha[idx] = 1
      }
    }
  }
  return { color, alpha, width, height }
}

/** Box-downsamples the supersampled buffer into 8-bit RGBA. */
function resolve(buffer, factor) {
  const width = buffer.width / factor
  const height = buffer.height / factor
  const out = Buffer.alloc(width * height * 4)
  const samples = factor * factor
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0 // colour sums are already coverage-weighted
      for (let sy = 0; sy < factor; sy++) {
        for (let sx = 0; sx < factor; sx++) {
          const idx = (y * factor + sy) * buffer.width + (x * factor + sx)
          r += buffer.color[idx * 3]
          g += buffer.color[idx * 3 + 1]
          b += buffer.color[idx * 3 + 2]
          a += buffer.alpha[idx]
        }
      }
      const o = (y * width + x) * 4
      if (a > 0) {
        // Un-premultiply by coverage so edge pixels keep the model's colour
        // instead of darkening toward the transparent background.
        out[o] = Math.min(255, Math.round(r / a))
        out[o + 1] = Math.min(255, Math.round(g / a))
        out[o + 2] = Math.min(255, Math.round(b / a))
      } else {
        out[o] = BACKGROUND[0]
        out[o + 1] = BACKGROUND[1]
        out[o + 2] = BACKGROUND[2]
      }
      out[o + 3] = Math.round((a / samples) * 255)
    }
  }
  return { data: out, width, height }
}

// -------------------------------------------------------------- PNG output

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, "ascii"), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePNG({ data, width, height }) {
  const stride = width * 4
  // One filter byte per scanline; filter 0 (none) compresses fine here.
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

// ------------------------------------------------------------------- main

const requested = argv.filter((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--size")
const slugs = requested.length ? requested : modelSlugs()
const kernel = createKernel()

fs.mkdirSync(OUT_DIR, { recursive: true })
console.log("")
for (const slug of slugs) {
  const model = readModel(slug)
  const directives = modelDirectives(model.source)
  const parts = modelParts(model.source)

  // A kit's thumbnail shows the kit. Every part is rendered and laid out the
  // way the viewer lays them out, so the grid says what the model actually is
  // rather than showing whichever piece happens to be the default.
  const wanted = parts ? parts.options.map((option) => option.value) : [null]
  const pieces = []
  for (const part of wanted) {
    const result = await kernel.render({
      source: model.source,
      parameters: part ? { [parts.parameter]: part } : {},
      libraries: directives.libraries,
      fonts: directives.fonts,
      ...(directives.features ? { features: directives.features } : {}),
    })
    if (!result.ok) {
      console.log(`  \x1b[31m✗\x1b[0m ${slug}${part ? ` · ${part}` : ""} — render failed`)
      pieces.length = 0
      break
    }
    pieces.push({ part, geometry: withBounds(trianglesFromSTL(result.output)) })
  }
  if (!pieces.length) continue

  const geometry = combineParts(pieces)
  const buffer = render(geometry, SIZE * SUPERSAMPLE)
  const png = encodePNG(resolve(buffer, SUPERSAMPLE))
  const file = path.join(OUT_DIR, `${slug}.png`)
  fs.writeFileSync(file, png)
  console.log(`  \x1b[32m✓\x1b[0m ${slug.padEnd(22)} ${geometry.count} tris → ${path.relative(process.cwd(), file)} (${(png.length / 1024).toFixed(0)} KB)`)
}
console.log("")
