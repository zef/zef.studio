// Runs OpenSCAD, compiled to WebAssembly, and hands back an STL.
//
// The kernel knows nothing about how assets are fetched — callers supply a
// small `assets` adapter — so the exact same code drives the browser worker
// and the Node scripts that verify models and render preview images.
//
// A quirk worth knowing: an Emscripten instance is single-use. Its `main` runs
// once and then the runtime is spent. So every render gets a fresh instance,
// and the expensive part (compiling 9 MB of WebAssembly) is done once and
// reused via `instantiateWasm`. That takes instantiation down to a few ms.

export const ASSET_BASE = "/3d-printing"

const LIBRARY_MOUNT = "/libraries"
const FONT_MOUNT = "/fonts"
const MODEL_PATH = "/model.scad"

// Where a library's packed JSON lives, and the directory name models
// `include <...>` it by.
export const LIBRARIES = {
  BOSL2: { pack: "libraries/bosl2.json", dir: "BOSL2" },
}

// Experimental OpenSCAD features that are safe to turn on for every model.
// `textmetrics` is what BOSL2 needs to lay text out along a path; `roof` and
// `import-function` are additive. Deliberately excludes `lazy-union`, which
// changes what a top-level union means.
export const DEFAULT_FEATURES = ["textmetrics", "roof", "import-function"]

export const FONTS = [
  "fonts/DejaVuSans.ttf",
  "fonts/DejaVuSans-Bold.ttf",
  "fonts/DejaVuSansMono.ttf",
]

// fontconfig needs a config file before it will look anywhere for fonts.
const FONTS_CONF = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${FONT_MOUNT}</dir>
  <cachedir>/tmp/fontconfig</cachedir>
  <config></config>
</fontconfig>
`

/**
 * Formats a JavaScript value as an OpenSCAD literal for `-D name=value`.
 * Arguments go straight to main() as argv, so there's no shell to quote for —
 * only OpenSCAD's own syntax to satisfy.
 */
export function scadLiteral(value) {
  if (value === null || value === undefined) return "undef"
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "undef"
    // Avoid exponent notation, which OpenSCAD's parser won't take.
    return Number.isInteger(value) ? String(value) : value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")
  }
  if (Array.isArray(value)) return `[${value.map(scadLiteral).join(",")}]`
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`
}

/** Builds the `-D` arguments for a set of parameter values. */
export function parameterArgs(parameters = {}) {
  const args = []
  for (const [name, value] of Object.entries(parameters)) {
    if (value === undefined) continue
    args.push("-D", `${name}=${scadLiteral(value)}`)
  }
  return args
}

export class OpenSCADKernel {
  /**
   * @param {object} options
   * @param {object} options.assets adapter with `bytes(path)`, `text(path)` and
   *   `moduleUrl(path)` — all relative to the vendored asset base.
   */
  constructor({ assets }) {
    this.assets = assets
    this.factory = null
    this.compiled = null
    this.libraryCache = new Map()
    this.fontCache = null
    this.warmupPromise = null
  }

  /**
   * Loads and compiles the WebAssembly module. Safe to call repeatedly; the
   * work happens once. Callers can kick this off early to hide the download.
   */
  warmup() {
    if (!this.warmupPromise) {
      this.warmupPromise = this._warmup().catch((error) => {
        // Let a later attempt retry rather than caching the failure forever.
        this.warmupPromise = null
        throw error
      })
    }
    return this.warmupPromise
  }

  async _warmup() {
    const [factoryModule, wasmBytes] = await Promise.all([
      import(/* webpackIgnore: true */ this.assets.moduleUrl("runtime/openscad.js")),
      this.assets.bytes("runtime/openscad.wasm"),
    ])
    this.factory = factoryModule.default
    this.compiled = await WebAssembly.compile(wasmBytes)
  }

  async library(name) {
    const spec = LIBRARIES[name]
    if (!spec) throw new Error(`Unknown OpenSCAD library: ${name}`)
    if (!this.libraryCache.has(name)) {
      this.libraryCache.set(name, this.assets.text(spec.pack).then(JSON.parse))
    }
    return this.libraryCache.get(name)
  }

  async fonts() {
    if (!this.fontCache) {
      this.fontCache = Promise.all(
        FONTS.map(async (path) => [path.split("/").pop(), await this.assets.bytes(path)])
      )
    }
    return this.fontCache
  }

  /**
   * Renders OpenSCAD source to a mesh.
   *
   * @param {object} options
   * @param {string} options.source          the .scad source
   * @param {object} [options.parameters]    values injected with -D
   * @param {string[]} [options.libraries]   library names to mount, e.g. ["BOSL2"]
   * @param {boolean} [options.fonts]        mount fonts (needed for text())
   * @param {string[]} [options.features]    experimental features to enable
   * @param {string} [options.format]        OpenSCAD export format, default binstl
   * @param {(line: string) => void} [options.onLog]
   * @returns {Promise<{ok: boolean, exitCode: number, output: Uint8Array|null, log: string[], ms: number}>}
   */
  async render({
    source,
    parameters = {},
    libraries = [],
    fonts = false,
    features = DEFAULT_FEATURES,
    format = "binstl",
    extraArgs = [],
    onLog,
  }) {
    await this.warmup()

    const log = []
    const record = (line) => {
      log.push(line)
      if (onLog) onLog(line)
    }

    // Resolve everything the render needs before building the instance, so the
    // instance is short-lived and we aren't holding a half-set-up runtime.
    const [libraryPacks, fontFiles] = await Promise.all([
      Promise.all(libraries.map(async (name) => [LIBRARIES[name].dir, await this.library(name)])),
      fonts ? this.fonts() : Promise.resolve([]),
    ])

    const compiled = this.compiled
    const instance = await this.factory({
      noInitialRun: true,
      print: record,
      printErr: record,
      instantiateWasm(imports, onSuccess) {
        WebAssembly.instantiate(compiled, imports).then((i) => onSuccess(i, compiled))
        return {}
      },
    })

    const { FS } = instance
    if (libraryPacks.length) {
      FS.mkdir(LIBRARY_MOUNT)
      for (const [dir, pack] of libraryPacks) {
        FS.mkdir(`${LIBRARY_MOUNT}/${dir}`)
        for (const [name, contents] of Object.entries(pack)) {
          FS.writeFile(`${LIBRARY_MOUNT}/${dir}/${name}`, contents)
        }
      }
      instance.ENV.OPENSCADPATH = LIBRARY_MOUNT
    }

    if (fontFiles.length) {
      FS.mkdir(FONT_MOUNT)
      for (const [name, bytes] of fontFiles) FS.writeFile(`${FONT_MOUNT}/${name}`, bytes)
      FS.writeFile(`${FONT_MOUNT}/fonts.conf`, FONTS_CONF)
      instance.ENV.FONTCONFIG_FILE = `${FONT_MOUNT}/fonts.conf`
      instance.ENV.FONTCONFIG_PATH = FONT_MOUNT
    }

    FS.writeFile(MODEL_PATH, source)

    const outputPath = `/model.${format === "binstl" || format === "asciistl" ? "stl" : format}`
    const args = [
      MODEL_PATH,
      "-o", outputPath,
      `--export-format=${format}`,
      // Manifold is dramatically faster than the CGAL path and is what makes
      // dragging a slider feel interactive rather than like a batch job.
      "--backend=manifold",
      ...features.flatMap((feature) => ["--enable", feature]),
      ...parameterArgs(parameters),
      ...extraArgs,
    ]

    const started = Date.now()
    let exitCode
    try {
      exitCode = instance.callMain(args)
    } catch (error) {
      // A hard abort (out of memory, an unsupported instruction, a runtime that
      // gave up) throws instead of returning. Tagged as an error so it travels
      // with the rest of them -- untagged, every consumer that filters the log
      // for problems drops the one line explaining why there is no output.
      record(`ERROR: OpenSCAD aborted: ${error?.message || error}`)
      exitCode = -1
    }
    const ms = Date.now() - started

    let output = null
    try {
      const data = FS.readFile(outputPath)
      // Copy out of the instance's heap; the instance is about to be dropped.
      if (data.length) output = new Uint8Array(data)
    } catch {
      // No output file — the log explains why.
    }

    return { ok: exitCode === 0 && output !== null, exitCode, output, log, ms }
  }
}

// ---------------------------------------------------------------- log reading

// OpenSCAD reports echo() output on stderr as `ECHO: "..."`. Models use it to
// surface derived measurements — capacity, overall height — that the customizer
// shows beneath the viewer.
const ECHO = /^ECHO:\s*"?(.*?)"?\s*$/

export function extractEchoes(log) {
  return log.flatMap((line) => {
    const match = ECHO.exec(line)
    return match ? [match[1]] : []
  })
}

// Anything OpenSCAD flagged, minus the noise it prints on every single run.
//
// The Manifold conversion warning is here because it is a note about which
// internal path OpenSCAD took, not about the geometry: BOSL2 hands it a
// polyset it can't convert when a textured cylinder is differenced against,
// OpenSCAD falls back, and the exported mesh comes out watertight either way.
// There is nothing a visitor could do about it, so it doesn't belong in a
// panel of things to fix. It is still reported by scripts/scad-render.mjs,
// where the person who could act on it is the one reading.
//
// The trace that follows every failed assertion is dropped for the same
// reason: it only ever says "called by 'assert'", which the message above it
// has already made clear.
const IGNORED = /Could not initialize localization|Compiling design|Top level object|PolySet -> Manifold conversion failed|TRACE: called by 'assert'|^\s*(Simple|Vertices|Halfedges|Edges|Halffacets|Facets|Volumes|Genus|Status):/

export function extractProblems(log) {
  return log.filter((line) => /WARNING|ERROR|Parser error|TRACE/i.test(line) && !IGNORED.test(line))
}

/**
 * Why a render produced nothing, guaranteeing an answer.
 *
 * Usually the log flagged something itself. When it didn't, OpenSCAD died
 * without filing a complaint in the words we look for, and the exit code and
 * the last few lines are all there is — which still beats telling someone
 * "no geometry was produced" and leaving them to guess.
 */
export function failureProblems(result) {
  const flagged = extractProblems(result.log)
  if (flagged.length) return flagged

  const tail = result.log.filter((line) => line.trim()).slice(-3)
  return [`OpenSCAD exited with code ${result.exitCode} and produced no geometry.`, ...tail]
}

/** Asset adapter for the browser (worker or main thread). */
export function browserAssets(base = ASSET_BASE) {
  const url = (path) => new URL(`${base}/${path}`, self.location.href).href
  const fetchOk = async (path) => {
    const response = await fetch(url(path))
    if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`)
    return response
  }
  return {
    moduleUrl: url,
    bytes: async (path) => new Uint8Array(await (await fetchOk(path)).arrayBuffer()),
    text: async (path) => (await fetchOk(path)).text(),
  }
}
