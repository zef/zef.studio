// A minimal ZIP writer, for handing several files over as one download.
//
// Each part of a multi-part model is a separate STL that wants its own
// filename, and a browser can't deliver a set of named files from one click:
// firing several downloads at once gets the visitor a permission prompt at
// best and a silently dropped file at worst. One archive sidesteps that, and
// arrives as a folder of properly-named parts.
//
// Written out here rather than pulled in. The format is a few headers wrapped
// around the file bytes, and the compression is the platform's own
// CompressionStream — a library for this would outweigh it several times over,
// and it would be shipped to every visitor who opens a model.

const LOCAL_SIG = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const END_SIG = 0x06054b50

const STORED = 0
const DEFLATE = 8
const VERSION = 20 // 2.0: everything used here
const UTF8_NAMES = 0x0800

const LOCAL_HEADER = 30
const CENTRAL_HEADER = 46
const END_RECORD = 22

// CRC-32, which every entry carries and unzip actually checks.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes) {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * Deflates with the platform's own compressor, or returns null if it can't.
 * Stored entries are always legal, so failing here costs size and nothing else.
 */
async function deflate(bytes) {
  if (typeof CompressionStream !== "function") return null
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch {
    return null
  }
}

// Zip timestamps are MS-DOS: two seconds of resolution, and 1980 as year zero.
const dosTime = (d) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff
const dosDate = (d) =>
  (((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff

/**
 * Packs files into a ZIP archive.
 *
 * @param {{name: string, bytes: Uint8Array}[]} files
 * @param {Date} [modified] timestamp recorded against every entry
 * @returns {Promise<Blob>}
 */
export async function zipFiles(files, modified = new Date()) {
  const encoder = new TextEncoder()
  const time = dosTime(modified)
  const date = dosDate(modified)

  const entries = await Promise.all(
    files.map(async ({ name, bytes }) => {
      const compressed = await deflate(bytes)
      // Only worth the deflate header if it actually came out smaller — which
      // it won't for something already compressed.
      const packed = compressed && compressed.length < bytes.length
      return {
        name: encoder.encode(name),
        data: packed ? compressed : bytes,
        method: packed ? DEFLATE : STORED,
        size: bytes.length,
        crc: crc32(bytes),
      }
    })
  )

  const total =
    entries.reduce(
      (sum, e) => sum + LOCAL_HEADER + CENTRAL_HEADER + e.name.length * 2 + e.data.length,
      0
    ) + END_RECORD

  const buffer = new ArrayBuffer(total)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  let at = 0

  for (const entry of entries) {
    entry.offset = at
    view.setUint32(at, LOCAL_SIG, true)
    view.setUint16(at + 4, VERSION, true)
    view.setUint16(at + 6, UTF8_NAMES, true)
    view.setUint16(at + 8, entry.method, true)
    view.setUint16(at + 10, time, true)
    view.setUint16(at + 12, date, true)
    view.setUint32(at + 14, entry.crc, true)
    view.setUint32(at + 18, entry.data.length, true)
    view.setUint32(at + 22, entry.size, true)
    view.setUint16(at + 26, entry.name.length, true)
    view.setUint16(at + 28, 0, true) // no extra field
    at += LOCAL_HEADER
    bytes.set(entry.name, at)
    at += entry.name.length
    bytes.set(entry.data, at)
    at += entry.data.length
  }

  const centralStart = at
  for (const entry of entries) {
    view.setUint32(at, CENTRAL_SIG, true)
    view.setUint16(at + 4, VERSION, true)
    view.setUint16(at + 6, VERSION, true)
    view.setUint16(at + 8, UTF8_NAMES, true)
    view.setUint16(at + 10, entry.method, true)
    view.setUint16(at + 12, time, true)
    view.setUint16(at + 14, date, true)
    view.setUint32(at + 16, entry.crc, true)
    view.setUint32(at + 20, entry.data.length, true)
    view.setUint32(at + 24, entry.size, true)
    view.setUint16(at + 28, entry.name.length, true)
    view.setUint16(at + 30, 0, true) // extra
    view.setUint16(at + 32, 0, true) // comment
    view.setUint16(at + 34, 0, true) // disk number
    view.setUint16(at + 36, 0, true) // internal attributes
    view.setUint32(at + 38, 0, true) // external attributes
    view.setUint32(at + 42, entry.offset, true)
    at += CENTRAL_HEADER
    bytes.set(entry.name, at)
    at += entry.name.length
  }

  view.setUint32(at, END_SIG, true)
  view.setUint16(at + 4, 0, true) // this disk
  view.setUint16(at + 6, 0, true) // disk the central directory starts on
  view.setUint16(at + 8, entries.length, true)
  view.setUint16(at + 10, entries.length, true)
  view.setUint32(at + 12, at - centralStart, true)
  view.setUint32(at + 16, centralStart, true)
  view.setUint16(at + 20, 0, true) // archive comment

  return new Blob([buffer], { type: "application/zip" })
}
