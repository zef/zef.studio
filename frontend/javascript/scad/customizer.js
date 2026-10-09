// <scad-customizer> — the whole interactive piece.
//
// Holds the worker that runs OpenSCAD, the WebGL viewer, the generated
// parameter form, presets, URL sharing and downloads. The model schema is
// handed to it as JSON in a <script> tag, so the element itself is generic:
// everything model-specific was parsed out of the .scad file at build time.

import {
  browserAssets,
  extractEchoes,
  extractProblems,
  failureProblems,
  OpenSCADKernel,
} from "../../../src/3d-printing/worker/kernel.js"
import { Controls } from "./controls.js"
import { layoutParts, mergeGeometries } from "./parts.js"
import { decodeState, encodeState, replaceHash, shareURL } from "./share.js"
import { highlight } from "../syntax/highlight.js"
import "../syntax/openscad.js"
import { customizeSource } from "./source.js"
import { estimateWeight, parseSTL } from "./stl.js"
import { Viewer } from "./viewer.js"
import { zipFiles } from "./zip.js"

// Once someone opts into the download on any model, other models load without
// asking again — it's already in the browser cache by then.
const OPT_IN_KEY = "scad-customizer-opt-in"
// Which unit the page is worked in. Stores the unit rather than a yes/no,
// since it is a choice between two now and not a thing being switched on.
const UNIT_KEY = "scad-customizer-working-unit"
const RENDER_DEBOUNCE_MS = 220

// The preset entry standing for the values the model itself declares. Naming it
// gives the defaults a place in the same list as everything else, rather than a
// stray "reset" button with no story about where those numbers came from.
const AS_DESIGNED = "As designed"

// The name field's starting value. Treated as "unnamed": it isn't worth
// putting in a shared link, since it says nothing the recipient didn't know.
const DEFAULT_SET_NAME = "customized"

// What most people leave their slicer set to. Shown alongside the solid weight
// rather than as a control: the useful thing is the pair of numbers, and one
// more stepper to fiddle with wasn't earning its place.
const TYPICAL_INFILL = 0.2

// ...and only while they are actually two numbers. A part with walls thin
// enough to print solid all the way through has no interior to skimp on, so
// the infill figure comes out identical to the solid one, and the same number
// under a second label reads as a mistake rather than as information. Across
// the models here the split is stark — the parts that benefit save 10-20%,
// and the rest save nothing at all — so anything in this range would do.
const INFILL_WORTH_SHOWING = 0.05

// A fair middle for PLA — generic runs nearer $15, Prusament nearer $30. The
// rate is printed next to the price so the assumption is visible rather than
// baked into a number nobody can check.
const PRICE_PER_KG = 20

// An arrow into a tray. Inline because it is the only icon on the site and a
// sprite, a font or a request would all outweigh nine lines of path data.
const DOWNLOAD_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
  <path d="M8 1.6v7.2M5 6l3 3 3-3" />
  <path d="M2.6 11.4v2.4h10.8v-2.4" />
</svg>`

export class ScadCustomizer extends HTMLElement {
  connectedCallback() {
    if (this.initialized) return
    this.initialized = true

    this.schema = JSON.parse(this.querySelector("script[type='application/json']").textContent)
    this.assetBase = this.dataset.assetBase || "/3d-printing"
    this.workerURL = this.dataset.worker || `${this.assetBase}/worker/worker.js`

    this.values = { ...this.schema.defaults }
    this.activePreset = null

    // A model that builds several pieces from one file nominates the parameter
    // that picks between them. Everything below treats a single-part model as
    // one nameless part, so there is one code path rather than two.
    this.parts = this.schema.parts || null
    this.selection = this.parts ? [String(this.parts.default ?? this.parts.options[0].value)] : []

    // Rendered pieces, keyed by part. Ticking a part you already rendered is
    // free; changing any parameter invalidates the lot, which is what
    // `cacheKey` is for.
    this.cache = new Map()
    // Parts that wouldn't build at these values, and why. Kept beside the
    // cache and cleared with it, so a failing part isn't retried on every
    // tick of an unrelated checkbox.
    this.failures = new Map()
    this.cacheKey = null

    this.batchId = 0
    this.queue = []
    // Set once the worker proves it can't do the job; see renderInPage.
    this.renderInThisThread = false
    this.localKernel = null
    this.pending = false
    this.busy = false
    this.framedFor = null
    this.worker = null

    this.cacheElements()
    this.buildControls()
    this.applyInitialState()
    this.wireButtons()

    // A shared link is a request to see that exact thing, so skip the prompt.
    const wanted = window.location.hash.length > 1
    if (wanted || sessionStorage.getItem(OPT_IN_KEY) === "yes") this.start()
  }

  disconnectedCallback() {
    if (this.onHashChange) window.removeEventListener("hashchange", this.onHashChange)
    this.worker?.terminate()
    this.viewer?.destroy()
  }

  cacheElements() {
    const find = (role) => this.querySelector(`[data-role="${role}"]`)
    this.el = {
      canvas: find("canvas"),
      stage: find("stage"),
      poster: find("poster"),
      startButton: find("start"),
      controls: find("controls"),
      parts: find("parts"),
      presets: find("presets"),
      status: find("status"),
      stats: find("stats"),
      computed: find("computed"),
      problems: find("problems"),
      downloadSTL: find("download-stl"),
      downloadSCAD: find("download-scad"),
      downloadPreset: find("download-preset"),
      presetName: find("preset-name"),
      presetVersion: find("preset-version"),
      uploadPreset: find("upload-preset"),
      uploadStatus: find("upload-status"),
      share: find("share"),
      recenter: find("recenter"),
      inches: find("inches"),
      sourceToggle: find("source-toggle"),
      source: find("source"),
    }
  }

  // ------------------------------------------------------------ set-up

  buildControls() {
    this.pageUnit = localStorage.getItem(UNIT_KEY) === "inch" ? "inch" : "mm"
    this.controls = new Controls(this.el.controls, this.schema, (name, value) => {
      this.values[name] = value
      // Any manual edit means this is no longer "the preset", it's your own.
      this.setActivePreset(null, { keepValues: true })
      this.syncURL()
      this.refreshSource()
      this.scheduleRender()
    }, this.pageUnit)

    this.buildParts()

    for (const name of [AS_DESIGNED, ...Object.keys(this.schema.presets || {})]) {
      const button = document.createElement("button")
      button.type = "button"
      button.className = "scad-preset"
      button.textContent = name
      button.addEventListener("click", () => this.applyPreset(name))
      this.el.presets.append(button)
    }
  }

  presetValues(name) {
    if (name === AS_DESIGNED) return {}
    return this.schema.presets?.[name]
  }

  // ------------------------------------------------------------- parts

  /**
   * The export checklist. A part is a thing you print, so each row carries what
   * it will measure, what it will weigh and the name of the file it will
   * arrive as — the questions you'd otherwise have to download it to answer.
   */
  buildParts() {
    if (!this.parts || !this.el.parts) return

    this.partRows = new Map()
    for (const option of this.parts.options) {
      const value = String(option.value)
      const id = `scad-part-${this.schema.slug}-${value.replace(/\W/g, "_")}`

      const row = document.createElement("li")
      row.className = "scad-part"

      // The box and its label are siblings rather than nested, so the row is
      // one grid and the filename below lines up under the name exactly
      // instead of by a guessed indent.
      const box = document.createElement("input")
      box.type = "checkbox"
      box.id = id
      box.className = "scad-part-box"
      box.addEventListener("change", () => this.togglePart(value, box.checked))

      const name = document.createElement("label")
      name.className = "scad-part-name"
      name.htmlFor = id
      name.textContent = option.label

      const measure = document.createElement("span")
      measure.className = "scad-part-measure"
      // Name and measurement share a line where there is room and stack where
      // there isn't, so they wrap as a pair rather than the name breaking
      // mid-phrase around a stubborn column of numbers.
      const head = document.createElement("span")
      head.className = "scad-part-head"
      head.append(name, measure)

      const file = document.createElement("code")
      file.className = "scad-part-file"

      // One part on its own, without changing what's ticked. Appears once
      // there is something to hand over.
      const get = document.createElement("button")
      get.type = "button"
      get.className = "scad-part-get"
      get.innerHTML = DOWNLOAD_ICON
      get.setAttribute("aria-label", `Download ${option.label}`)
      get.hidden = true
      get.addEventListener("click", () => this.downloadPart(value))

      row.append(box, head, get, file)
      this.el.parts.append(row)
      this.partRows.set(value, { row, box, measure, file, get })
    }
    this.refreshPartRows()
  }

  togglePart(value, wanted) {
    const chosen = new Set(this.selection)
    if (wanted) chosen.add(value)
    else chosen.delete(value)
    // Nothing sensible renders with no parts at all, so the last one holds.
    if (!chosen.size) return

    // Ordered by the model's own declaration however they were ticked, so the
    // row on screen, the parts on the plate and the files in the archive all
    // read the same way round.
    this.selection = this.parts.options
      .map((option) => String(option.value))
      .filter((option) => chosen.has(option))

    this.refreshPartRows()
    this.syncURL()
    this.refreshSource()
    // Unticking takes effect immediately — the render only has to catch up on
    // parts that were added.
    this.showRendered({ final: !this.missingParts().length })
    this.scheduleRender()
  }

  refreshPartRows() {
    if (!this.partRows) return

    const onlyOne = this.selection.length === 1
    for (const [value, row] of this.partRows) {
      const on = this.selection.includes(value)
      row.row.classList.toggle("is-on", on)
      row.box.checked = on
      row.box.disabled = on && onlyOne
      row.box.title = row.box.disabled ? "At least one part has to be selected." : ""
      // Only name a file that is actually coming: a part that wouldn't build
      // has none, and a part waiting its turn doesn't have one yet.
      row.file.textContent = on && this.cache.has(value) ? this.partDownloadName(value) : ""

      const piece = this.cache.get(value)
      const failed = on && this.failures.has(value)
      row.row.classList.toggle("is-failed", failed)
      row.measure.textContent = failed ? "wouldn't build" : on && piece ? partMeasure(piece) : ""

      row.get.hidden = !(on && piece)
      // The tooltip names the file this button gives you, which is the full
      // one — a part taken on its own isn't inside a folder that says which
      // model it came from.
      row.get.title = piece ? `Download ${this.soloFileName(value)}` : ""
    }
    this.refreshDownloadLabel()
  }

  /** Selected parts, or one nameless part for a model that has no such notion. */
  activeParts() {
    return this.parts ? [...this.selection] : [null]
  }

  missingParts() {
    return this.activeParts().filter(
      (part) => !this.cache.has(part) && !this.failures.has(part)
    )
  }

  /** Rendered pieces for the current selection, in declaration order. */
  renderedPieces() {
    return this.activeParts()
      .map((part) => this.cache.get(part))
      .filter(Boolean)
  }

  /** The values to render or write out with, with the part selector set. */
  valuesFor(part) {
    return part === null || !this.parts
      ? this.values
      : { ...this.values, [this.parts.parameter]: part }
  }

  applyInitialState() {
    this.setPageUnit(this.pageUnit)
    this.applyHashState({ render: false })

    // Changing only the hash doesn't reload the page, so following a shared
    // link to the model you're already looking at — or using back and forward —
    // has to be handled here. Our own updates go through replaceState, which
    // deliberately doesn't fire this.
    this.onHashChange = () => this.applyHashState({ render: true })
    window.addEventListener("hashchange", this.onHashChange)
  }

  applyHashState({ render }) {
    const { values, preset, name, version, parts } = decodeState(
      window.location.hash,
      this.controls.parameters
    )
    if (name && this.el.presetName) this.el.presetName.value = name
    if (this.el.presetVersion) this.el.presetVersion.value = version || ""
    this.applyPartSelection(parts)

    if (preset && this.presetValues(preset)) {
      this.applyPreset(preset, { render })
      return
    }

    // A hash with no parameters means "the default configuration".
    this.values = { ...this.schema.defaults, ...values }
    this.controls.setValues(this.values)
    this.setActivePreset(null, { keepValues: true })
    if (render) this.scheduleRender()
  }

  /** Takes a part selection from a link, ignoring anything this model lacks. */
  applyPartSelection(wanted) {
    if (!this.parts || !wanted?.length) return

    const known = this.parts.options.map((option) => String(option.value))
    const chosen = known.filter((part) => wanted.includes(part))
    if (!chosen.length) return

    this.selection = chosen
    this.refreshPartRows()
  }

  wireButtons() {
    this.el.startButton?.addEventListener("click", () => {
      sessionStorage.setItem(OPT_IN_KEY, "yes")
      this.start()
    })
    this.el.recenter?.addEventListener("click", () => this.viewer?.frame())
    this.el.inches?.addEventListener("change", () =>
      this.setPageUnit(this.el.inches.checked ? "inch" : "mm")
    )
    this.el.sourceToggle?.addEventListener("click", () => this.toggleSource())
    this.el.uploadPreset?.addEventListener("change", (event) => this.loadParameterFile(event))
    // Both of these end up in filenames, so slugify as you type and show what
    // you're actually going to get.
    for (const field of [this.el.presetName, this.el.presetVersion]) {
      field?.addEventListener("input", () => {
        const caretAtEnd = field.selectionStart === field.value.length
        const cleaned = slugifyLive(field.value)
        if (cleaned !== field.value) {
          field.value = cleaned
          if (caretAtEnd) field.setSelectionRange(cleaned.length, cleaned.length)
        }
        this.syncURL()
      })
    }
    this.el.downloadSTL?.addEventListener("click", () => this.downloadSTL())
    this.el.downloadSCAD?.addEventListener("click", () => this.downloadSCAD())
    this.el.downloadPreset?.addEventListener("click", () => this.downloadPreset())
    this.el.share?.addEventListener("click", () => this.copyShareLink())
  }

  // ------------------------------------------------------------ running

  async start() {
    if (this.started) return
    this.started = true
    this.setAttribute("data-started", "")
    this.setStatus("Loading OpenSCAD…", "loading")

    try {
      this.viewer = new Viewer(this.el.canvas)
    } catch (error) {
      this.setStatus(error.message, "error")
      return
    }

    this.spawnWorker()
    this.worker.postMessage({ type: "warmup", assetBase: this.assetBase })
  }

  /** Warms the in-page kernel and begins, standing in for the worker's "ready". */
  async startInPage() {
    try {
      await this.mainThreadKernel()
      this.ready = true
      this.render()
    } catch (error) {
      this.setStatus(`Couldn't load OpenSCAD — ${error?.message || error}`, "error")
    }
  }

  spawnWorker() {
    this.worker = new Worker(this.workerURL, { type: "module" })
    this.worker.onmessage = (event) => this.handleWorkerMessage(event.data)
    this.worker.onerror = (event) => {
      // A module worker that fails to load reports an error event with no
      // message at all, so there is nothing to diagnose from and nothing to
      // be gained by stopping here. The page can do the work itself.
      if (!this.renderInThisThread) {
        console.info("scad: the worker failed to start; rendering in the page instead")
        this.moveRenderingIntoPage()
        this.startInPage()
        return
      }
      this.setStatus(`Worker failed: ${event.message || "unknown error"}`, "error")
      this.busy = false
    }
  }

  /** Switches to in-page rendering and lets go of the worker. */
  moveRenderingIntoPage() {
    this.renderInThisThread = true
    this.worker?.terminate()
    this.worker = null
  }

  handleWorkerMessage(message) {
    switch (message.type) {
      case "ready":
        this.ready = true
        this.render()
        break
      case "status":
        if (message.stage === "rendering") this.setStatus("Rendering…", "busy")
        break
      case "rendered":
        // A result from an abandoned batch describes values nobody is looking
        // at any more; the batch that replaced it is already in flight.
        if (message.id === this.batchId) this.acceptPart(message)
        break
      case "failed":
        if (message.id === this.batchId) this.showFailure(message)
        break
    }
  }

  scheduleRender() {
    if (!this.ready) return
    clearTimeout(this.debounce)
    this.debounce = setTimeout(() => this.render(), RENDER_DEBOUNCE_MS)
  }

  render() {
    if (!this.ready) return
    // OpenSCAD can't be interrupted mid-render, so queue the newest request and
    // pick it up the moment the part in flight lands.
    if (this.busy) {
      this.pending = true
      return
    }
    this.startBatch()
  }

  /**
   * Renders whatever the current selection is missing, one part at a time.
   *
   * Parts already rendered at these values are kept, so ticking a part you had
   * a moment ago costs nothing and only genuinely new geometry goes to the
   * worker. Any parameter change throws the lot away, since every part is built
   * from the same numbers.
   */
  startBatch() {
    const key = JSON.stringify(this.values)
    if (this.cacheKey !== key) {
      this.cache.clear()
      this.failures.clear()
      this.cacheKey = key
    }

    this.batchId += 1
    this.pending = false
    this.queue = this.missingParts()

    if (!this.queue.length) {
      this.busy = false
      this.showRendered({ final: true })
      return
    }

    this.busy = true
    this.renderNext()
  }

  renderNext() {
    const part = this.queue.shift()
    this.setStatus(this.progressLabel(part), "busy")
    const request = {
      type: "render",
      id: this.batchId,
      part,
      assetBase: this.assetBase,
      source: this.schema.source,
      parameters: this.valuesFor(part),
      libraries: this.schema.libraries,
      fonts: this.schema.fonts,
      features: this.schema.features,
    }
    if (this.renderInThisThread) this.renderInPage(request)
    else this.worker.postMessage(request)
  }

  /**
   * Runs the render here instead of in the worker.
   *
   * Normally the wrong place — OpenSCAD can't be interrupted, so this locks the
   * page up for as long as it takes, which is the whole reason the worker
   * exists. But how much stack a thread gets is the browser's business and the
   * browsers disagree sharply: Chrome hands a worker about four times the main
   * thread's (63,500 frames against 15,500, measured), while Safari's engine
   * gives the main thread less than half of Chrome's and its workers less
   * still. OpenSCAD recurses deeply enough that this decides whether a model
   * builds at all, so where there is more stack is where the render belongs.
   * A second of frozen page beats a part that will not build.
   */
  async mainThreadKernel() {
    if (!this.localKernel) {
      this.localKernel = new OpenSCADKernel({ assets: browserAssets(this.assetBase) })
    }
    await this.localKernel.warmup()
    return this.localKernel
  }

  async renderInPage(request) {
    const stale = () => request.id !== this.batchId
    try {
      const kernel = await this.mainThreadKernel()
      if (stale()) return
      // Let the status paint before the thread stops answering.
      await new Promise((resolve) => setTimeout(resolve, 0))

      const result = await kernel.render({
        source: request.source,
        parameters: request.parameters,
        libraries: request.libraries,
        fonts: request.fonts,
        ...(request.features ? { features: request.features } : {}),
      })
      if (stale()) return

      if (!result.ok) {
        this.showFailure({ part: request.part, problems: failureProblems(result), ms: result.ms })
        return
      }
      this.acceptPart({
        part: request.part,
        stl: result.output.buffer,
        ms: result.ms,
        echoes: extractEchoes(result.log),
        problems: extractProblems(result.log),
      })
    } catch (error) {
      if (stale()) return
      this.showFailure({ part: request.part, problems: [error?.message || String(error)] })
    }
  }

  progressLabel(part) {
    if (!this.parts) return "Rendering…"
    const label = this.partLabel(part)
    const done = this.selection.length - this.queue.length
    return this.selection.length > 1
      ? `Rendering ${label}… (${done} of ${this.selection.length})`
      : `Rendering ${label}…`
  }

  partLabel(part) {
    const option = this.parts?.options.find((entry) => String(entry.value) === part)
    return option?.label || part
  }

  /** Called when a part lands: file it, redraw, and move the batch along. */
  acceptPart(message) {
    let geometry
    try {
      geometry = parseSTL(message.stl)
    } catch (error) {
      // OpenSCAD did build this one; we couldn't read what came back. Say so,
      // because "couldn't build it" would send anyone looking in the model.
      this.failures.set(message.part, [
        `Couldn't read the geometry OpenSCAD returned — ${error.message}`,
      ])
      this.advance()
      return
    }

    this.failures.delete(message.part)
    this.cache.set(message.part, {
      part: message.part,
      geometry,
      bytes: new Uint8Array(message.stl),
      ms: message.ms,
      echoes: message.echoes || [],
      problems: message.problems || [],
    })
    this.advance()
  }

  /** Moves the batch on: the next part, a restart, or the finished picture. */
  advance() {
    // A change arrived while that part was rendering, so the rest of the batch
    // is already answering the wrong question. Start again from the new values.
    if (this.pending) {
      this.showRendered({ final: false })
      this.startBatch()
      return
    }

    if (this.queue.length) {
      this.showRendered({ final: false })
      this.renderNext()
      return
    }

    this.busy = false
    this.showRendered({ final: true })
  }

  /**
   * Draws whatever has been rendered so far.
   *
   * Called after every part rather than only at the end of a batch, so a kit
   * fills in piece by piece instead of showing nothing for several seconds.
   */
  showRendered({ final }) {
    const pieces = this.renderedPieces()

    if (pieces.length) {
      const geometry = mergeGeometries(layoutParts(pieces))
      const first = !this.viewer.geometry
      this.viewer.setGeometry(geometry)

      // The camera follows along while the selection is changing — parts appear
      // and it pulls back to take them in. Once the selection settles, nudging a
      // slider leaves the view exactly where the visitor put it.
      const key = this.selection.join(",")
      if (first || this.framedFor !== key) this.viewer.frame()
      else if (final) this.viewer.frameIfNeeded()
      if (final) this.framedFor = key
    }

    this.refreshPartRows()
    this.refreshStats()

    if (!final) return
    const failed = this.failedParts()
    this.setStatus(this.doneLabel(pieces, failed), failed.length ? "error" : "ok")
    this.showComputed(pieces.flatMap((piece) => piece.echoes))
    this.showProblems([
      ...failed.flatMap((part) => this.failures.get(part)),
      ...pieces.flatMap((piece) => piece.problems),
    ])
    this.setDownloadsEnabled(Boolean(pieces.length))
    this.refreshSource()
  }

  /** Selected parts that wouldn't build, in the order the model declares them. */
  failedParts() {
    return this.activeParts().filter((part) => this.failures.has(part))
  }

  doneLabel(pieces, failed = []) {
    const ms = pieces.reduce((total, piece) => total + piece.ms, 0)
    const built =
      pieces.length > 1 ? `${pieces.length} parts in ${formatMs(ms)}` : `Rendered in ${formatMs(ms)}`

    if (!failed.length) return built
    const names = this.parts ? failed.map((part) => this.partLabel(part)).join(", ") : "this"
    // Name what didn't build, but don't hide what did: the rest of the kit is
    // on screen and downloadable, and saying only "couldn't build" would read
    // as though nothing had.
    return pieces.length ? `${built} — ${names} failed` : `OpenSCAD couldn't build ${names}`
  }

  /**
   * Records that one part wouldn't build, and carries on with the rest.
   *
   * A model's rules are usually about one piece — a cap's primer pocket says
   * nothing about whether its tube is sound — so one part failing is no reason
   * to leave the others unrendered and the viewer empty.
   */
  showFailure({ problems, part }) {
    const list = problems?.length ? problems : ["No geometry was produced."]

    // The worker ran out of stack rather than hitting anything wrong with the
    // model. There is more of it on the main thread in the one engine where
    // this happens, so move there and try again — and stay there, rather than
    // spending a doomed worker render on every subsequent change.
    if (!this.renderInThisThread && list.some((line) => STACK_OVERFLOW.test(line))) {
      this.moveRenderingIntoPage()
      this.queue.unshift(part)
      console.info("scad: the worker ran out of stack; rendering in the page instead")
      this.renderNext()
      return
    }

    this.failures.set(part, list)
    this.advance()
  }

  // ------------------------------------------------------------- output

  /** Totals across everything selected. Per-part figures live in the checklist. */
  refreshStats() {
    const pieces = this.renderedPieces()
    if (!pieces.length) return

    const total = { volume: 0, solid: 0, sparse: 0, triangles: 0, bytes: 0 }
    for (const piece of pieces) {
      const solid = estimateWeight(piece.geometry, 1)
      total.volume += solid.solidVolume
      total.solid += solid.grams
      total.sparse += estimateWeight(piece.geometry, TYPICAL_INFILL).grams
      total.triangles += piece.geometry.triangles
      total.bytes += piece.bytes.length
    }

    const rows = []
    // One part has a size worth stating here. Several don't share one, and
    // each row of the checklist already carries its own.
    if (pieces.length === 1) {
      const { size: dimensions } = pieces[0].geometry.bounds
      const [x, y, z] = dimensions
      const size = `${round(x)} × ${round(y)} × ${round(z)} mm`
      // Decimal inches for the size triple: three fractions side by side is a
      // wall of slashes, and lining decimals compare at a glance. The unit
      // being worked in leads, with the other stacked under it, so the two
      // read as the same measurement twice instead of one long line.
      const inches = `${dimensions.map((mm) => (mm / 25.4).toFixed(2)).join(" × ")}″`
      rows.push(["Size", this.pageUnit === "inch" ? [inches, size] : size])
    }

    const many = pieces.length > 1
    rows.push(
      [many ? "Volume, all parts" : "Volume", `${total.volume.toFixed(1)} cm³ solid`],
      [many ? "Weight, all parts" : "Weight", `${formatGrams(total.solid)} in PLA`]
    )
    if (total.solid > 0 && total.sparse <= total.solid * (1 - INFILL_WORTH_SHOWING)) {
      rows.push([`Weight (${percent(TYPICAL_INFILL)} infill)`, formatGrams(total.sparse)])
    }
    rows.push(
      // Priced off the sparse weight, since that's what you'd actually print.
      ["Price", `${formatPrice(total.sparse)} @ $${PRICE_PER_KG}/kg`],
      [
        many ? "Download" : "STL file",
        many
          ? [`${this.fileStem()}.zip`, describeFiles(pieces.length, total)]
          : describeFiles(pieces.length, total),
      ]
    )

    this.el.stats.textContent = ""
    for (const [label, value] of rows) {
      const row = document.createElement("div")
      row.className = "scad-stat"
      row.append(labelled("dt", label), labelled("dd", value))
      this.el.stats.append(row)
    }
  }

  showComputed(echoes) {
    const panel = this.el.computed
    panel.textContent = ""
    // Every part echoes the same design figures, so a five-part kit reports
    // each of them five times over.
    const useful = [...new Set((echoes || []).filter(Boolean))]
    panel.closest("[data-role='computed-panel']")?.toggleAttribute("hidden", !useful.length)
    for (const line of useful) {
      const [label, value] = splitOnce(line, ":")
      const row = document.createElement("div")
      row.className = "scad-stat"
      row.append(labelled("dt", label), labelled("dd", value ?? ""))
      panel.append(row)
    }
  }

  showProblems(problems) {
    const panel = this.el.problems
    panel.textContent = ""
    const list = [...new Set(problems || [])]
    panel.toggleAttribute("hidden", !list.length)
    for (const line of list.slice(0, 6)) {
      const item = document.createElement("li")
      item.textContent = readableProblem(line)
      panel.append(item)
    }
  }

  /**
   * Sets what the page is worked in.
   *
   * Sweeps up every parameter that never declared a unit. The ones that did —
   * a wall thickness in millimetres, a caliber in inches — were already
   * decided and keep their own switch.
   */
  setPageUnit(unit) {
    this.pageUnit = unit === "inch" ? "inch" : "mm"
    this.classList.toggle("shows-inches", this.pageUnit === "inch")
    if (this.el.inches) this.el.inches.checked = this.pageUnit === "inch"
    localStorage.setItem(UNIT_KEY, this.pageUnit)
    this.controls?.setPageUnit(this.pageUnit)
    this.refreshStats()
  }

  // --------------------------------------------------------------- source

  toggleSource() {
    const open = this.el.source.hasAttribute("hidden")
    this.el.source.toggleAttribute("hidden", !open)
    this.el.sourceToggle.setAttribute("aria-expanded", String(open))
    this.el.sourceToggle.textContent = open ? "Hide Source" : "View Source"
    if (open) this.refreshSource()
  }

  /**
   * The values as they'd be written into a downloaded .scad. One file builds
   * every part, so the selector is set to the first part ticked — opening it
   * shows that piece, and its dropdown switches between the rest.
   */
  sourceValues() {
    return this.valuesFor(this.selection[0] ?? null)
  }

  /** Shows the source as it would download — with the current values in it. */
  refreshSource() {
    if (!this.el.source || this.el.source.hasAttribute("hidden")) return
    const source = customizeSource(this.schema.source, this.sourceValues())
    this.el.source.querySelector("code").innerHTML = highlight(source, "openscad")
  }

  setStatus(text, state) {
    this.el.status.textContent = text
    this.el.status.dataset.state = state
  }

  setDownloadsEnabled(enabled) {
    for (const key of ["downloadSTL", "downloadSCAD", "downloadPreset"]) {
      if (this.el[key]) this.el[key].disabled = !enabled
    }
  }

  // ------------------------------------------------------------ presets

  applyPreset(name, { render = true } = {}) {
    const preset = this.presetValues(name)
    if (!preset) return
    this.values = { ...this.schema.defaults, ...preset }
    this.controls.setValues(this.values)
    if (this.el.presetName) {
      this.el.presetName.value = name === AS_DESIGNED ? DEFAULT_SET_NAME : slugify(name)
    }
    if (this.el.presetVersion) this.el.presetVersion.value = ""
    this.setActivePreset(name)
    this.syncURL()
    if (render) this.scheduleRender()
  }

  setActivePreset(name, { keepValues = false } = {}) {
    if (this.activePreset === name) return
    this.activePreset = name
    for (const button of this.el.presets?.children || []) {
      button.classList.toggle("is-active", button.textContent === name)
    }
    if (!keepValues && !name) {
      this.values = { ...this.schema.defaults }
      this.controls.setValues(this.values)
    }
  }

  // -------------------------------------------------------------- share

  currentHash() {
    const name = this.parameterSetName()
    const worthSharing = name !== DEFAULT_SET_NAME && name !== slugify(this.activePreset || "")
    return encodeState({
      values: this.values,
      defaults: this.schema.defaults,
      preset: this.activePreset,
      name: worthSharing ? name : null,
      version: this.parameterSetVersion() || null,
      parts: this.sharedParts(),
    })
  }

  /**
   * The part selection, when it says something the recipient wouldn't assume.
   * A link to the part the model opens with doesn't need to spell that out.
   */
  sharedParts() {
    if (!this.parts) return null
    const initial = String(this.parts.default ?? this.parts.options[0].value)
    const untouched = this.selection.length === 1 && this.selection[0] === initial
    return untouched ? null : this.selection
  }

  syncURL() {
    replaceHash(this.currentHash())
  }

  async copyShareLink() {
    const url = shareURL(this.currentHash())
    const button = this.el.share
    const original = button.dataset.label || button.textContent
    button.dataset.label = original

    const copied = await copyText(url)
    button.textContent = copied ? "Copied" : "Press ⌘C to copy"
    button.classList.toggle("is-failed", !copied)
    if (!copied) selectText(this.showFallbackURL(url))
    setTimeout(() => {
      button.textContent = original
      button.classList.remove("is-failed")
    }, 2400)
  }

  /** Last resort: put the link on screen, selected, so it can be copied by hand. */
  showFallbackURL(url) {
    let field = this.querySelector("[data-role='share-fallback']")
    if (!field) {
      field = document.createElement("input")
      field.type = "text"
      field.readOnly = true
      field.className = "scad-text scad-share-fallback"
      field.dataset.role = "share-fallback"
      this.el.share.closest("li").append(field)
    }
    field.value = url
    return field
  }

  // ----------------------------------------------------------- download

  // Downloads end up alongside other variants of the same part, so the name has
  // to say which one this is. Whatever you called the set wins; failing that,
  // the preset it came from; failing that, nothing — the model's name alone.
  fileStem() {
    return [this.schema.slug, this.variantName()].filter(Boolean).join("-")
  }

  /**
   * What distinguishes this configuration from the model as designed.
   *
   * Deliberately only ever something a person chose: a name they typed or a
   * preset they picked. Naming the parameters that differ was worse than
   * nothing — it took whichever two came first in the file, which is an
   * accident of declaration order, and produced things like
   * `primer-pocket-false-fn-70`. The name field is right there, prefilled,
   * for anyone who wants their downloads told apart.
   */
  variantName() {
    const named = this.parameterSetName()
    const version = this.parameterSetVersion()
    if (named !== DEFAULT_SET_NAME || version) return slugify(this.parameterSetLabel())
    if (this.activePreset && this.activePreset !== AS_DESIGNED) return slugify(this.activePreset)
    return ""
  }

  /**
   * What a part arrives as, which depends on whether it is travelling alone.
   *
   * On its own it carries the whole story, because nothing else will say which
   * model or which settings it came from. Inside an archive the folder says
   * all of that once, so the file itself only has to say which piece it is.
   */
  partDownloadName(part) {
    return this.downloadCount() > 1 ? `${slugify(part)}.stl` : this.soloFileName(part)
  }

  /**
   * How many parts the download button will actually hand over.
   *
   * Counted from what built rather than what is ticked: if two of three parts
   * fail, the survivor leaves on its own and needs the name of one that isn't
   * inside a folder.
   */
  downloadCount() {
    return this.renderedPieces().length
  }

  /** The name a part carries when nothing around it says where it came from. */
  soloFileName(part) {
    return `${[this.fileStem(), part ? slugify(part) : null].filter(Boolean).join("-")}.stl`
  }

  /** Hands over a single part, whatever else happens to be ticked. */
  downloadPart(part) {
    const piece = this.cache.get(part)
    if (!piece) return
    save(new Blob([piece.bytes], { type: "model/stl" }), this.soloFileName(part))
  }

  async downloadSTL() {
    const pieces = this.renderedPieces()
    if (!pieces.length) return

    if (pieces.length === 1) {
      save(new Blob([pieces[0].bytes], { type: "model/stl" }), this.partDownloadName(pieces[0].part))
      return
    }

    // Zipping several megabytes takes a moment, and a second click would
    // start it over.
    const button = this.el.downloadSTL
    button.disabled = true
    try {
      // Everything goes in one folder, so unzipping into a downloads directory
      // lands a named kit rather than five loose parts.
      const folder = this.fileStem()
      const archive = await zipFiles(
        pieces.map((piece) => ({
          name: `${folder}/${this.partDownloadName(piece.part)}`,
          bytes: piece.bytes,
        }))
      )
      save(archive, `${folder}.zip`)
    } catch (error) {
      this.setStatus(`Couldn't build the archive — ${error.message}`, "error")
    } finally {
      button.disabled = false
    }
  }

  /** Says what the button will actually hand over, which depends on the ticks. */
  refreshDownloadLabel() {
    const button = this.el.downloadSTL
    if (!button || !this.parts) return
    button.textContent = this.downloadCount() > 1 ? "Download .zip" : "Download .stl"
  }

  downloadSCAD() {
    save(
      new Blob([customizeSource(this.schema.source, this.sourceValues())], { type: "text/plain" }),
      `${this.fileStem()}.scad`
    )
  }

  // OpenSCAD's own parameter-set format, so a configuration made here can be
  // opened in the desktop Customizer — and read back in below.
  downloadPreset() {
    const name = this.parameterSetLabel()
    // OpenSCAD's format has no notion of building several parts at once, so a
    // parameter set records the first one ticked and the link carries the rest.
    const values = Object.fromEntries(
      Object.entries(this.sourceValues()).map(([key, value]) => [key, String(value)])
    )
    const json = JSON.stringify({ fileFormatVersion: "1", parameterSets: { [name]: values } }, null, 2)
    save(new Blob([json], { type: "application/json" }), `${this.schema.slug}-${slugify(name)}.json`)
  }

  // The fields hold *live* slugs, which keep a trailing hyphen while you're
  // typing so a separator doesn't vanish mid-word. Anything that consumes them
  // — a filename, a set key, a link — takes the settled form instead.
  parameterSetName() {
    return slugify(this.el.presetName?.value.trim() || this.activePreset || DEFAULT_SET_NAME)
  }

  parameterSetVersion() {
    return slugify(this.el.presetVersion?.value.trim() || "")
  }

  /** Name and version as one label, for a filename or a set key. */
  parameterSetLabel() {
    return [this.parameterSetName(), this.parameterSetVersion()].filter(Boolean).join("-")
  }

  /**
   * Reads a parameter set back in. Accepts OpenSCAD's format — whether it came
   * from here or from the desktop app — and takes the first set in the file.
   */
  async loadParameterFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = "" // so re-picking the same file fires again

    try {
      const parsed = JSON.parse(await file.text())
      const sets = parsed.parameterSets || parsed
      const [name, raw] = Object.entries(sets)[0] || []
      if (!raw || typeof raw !== "object") throw new Error("no parameter sets in that file")

      const known = new Map(this.controls.parameters.map((p) => [p.name, p]))
      const applied = {}
      const unknown = []
      for (const [key, value] of Object.entries(raw)) {
        // A set saved from the desktop Customizer carries the part selector
        // along with everything else. It isn't a control here, but it does say
        // which part the set was written for.
        if (this.parts && key === this.parts.parameter) {
          this.applyPartSelection([String(value)])
          continue
        }
        const parameter = known.get(key)
        if (!parameter) {
          unknown.push(key)
          continue
        }
        applied[key] = coerce(value, parameter)
      }
      if (!Object.keys(applied).length) throw new Error("nothing in that file matches this model")

      this.values = { ...this.schema.defaults, ...applied }
      this.controls.setValues(this.values)
      this.setActivePreset(null, { keepValues: true })
      if (this.el.presetName && name) this.el.presetName.value = slugify(name)
      if (this.el.presetVersion) this.el.presetVersion.value = ""
      this.syncURL()
      this.refreshSource()
      this.scheduleRender()

      const skipped = unknown.length ? `, ignored ${unknown.length} unknown` : ""
      this.setUploadStatus(`Loaded ${Object.keys(applied).length} values${skipped}.`, false)
    } catch (error) {
      this.setUploadStatus(`Couldn't read that file — ${error.message}`, true)
    }
  }

  setUploadStatus(text, failed) {
    const node = this.el.uploadStatus
    if (!node) return
    node.textContent = text
    node.classList.toggle("is-failed", Boolean(failed))
    node.removeAttribute("hidden")
  }
}

// ------------------------------------------------------------- helpers

/** Copies text, preferring the async clipboard and falling back to execCommand. */
async function copyText(text) {
  try {
    // Needs a secure context and a focused document; both can fail legitimately.
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // The old way still works in places the Clipboard API refuses.
    const scratch = document.createElement("textarea")
    scratch.value = text
    scratch.setAttribute("readonly", "")
    scratch.style.cssText = "position:fixed;top:0;left:-9999px"
    document.body.append(scratch)
    scratch.select()
    let copied = false
    try {
      copied = document.execCommand("copy")
    } catch {
      copied = false
    }
    scratch.remove()
    return copied
  }
}

function selectText(input) {
  input.focus()
  input.select()
}

/** Coerces a value out of a parameter file into the type the schema declares. */
function coerce(raw, parameter) {
  if (typeof raw !== "string") return raw
  switch (parameter.type) {
    case "number": {
      const value = Number(raw)
      return Number.isFinite(value) ? value : parameter.default
    }
    case "boolean":
      return raw === "true" || raw === "1"
    case "vector":
      return raw.replace(/^\[|\]$/g, "").split(",").map(Number)
    case "enum": {
      const match = parameter.options?.find((option) => String(option.value) === raw)
      return match ? match.value : parameter.default
    }
    default:
      return raw
  }
}

function save(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Pass an array to stack lines within the cell — the stats table shows the
// same measurement in two unit systems that way.
function labelled(tag, text) {
  const node = document.createElement(tag)
  if (!Array.isArray(text)) {
    node.textContent = text
    return node
  }
  for (const line of text) {
    const span = document.createElement("span")
    span.textContent = line
    node.append(span)
  }
  return node
}

// Some failures are the browser's rather than the model's. This one is worth
// translating because it reads as a bug in the part when it isn't, and because
// the answer — open it somewhere else — is not guessable from the wording.
const STACK_OVERFLOW = /maximum call stack|call stack size exceeded|stack overflow/i

/**
 * Strips OpenSCAD's scaffolding off a problem, leaving what a person wrote.
 *
 * An assertion arrives wrapped in the expression that failed and the file it
 * was in — useful when you are editing the model, noise when you are trying
 * to print one. The message inside it was written for a reader, so show that.
 */
function readableProblem(line) {
  const trimmed = line.replace(/\s+in file .*$/, "")

  if (STACK_OVERFLOW.test(trimmed)) {
    return (
      "This part needs more call stack than this browser will give it. " +
      "Safari allows a good deal less of it than Chrome or Firefox, so the " +
      "same part usually builds in those. Nothing you can change here affects it."
    )
  }

  const asserted = trimmed.match(/Assertion\s+'(.+)'\s+failed:\s*"([\s\S]*)"$/)
  if (!asserted) return trimmed
  // Some assertions carry no message of their own; the expression is then the
  // only thing there is to say.
  return asserted[2].trim() || `Failed: ${asserted[1]}`
}

/** What the download comes to: how many files, how big, how detailed. */
function describeFiles(count, total) {
  return [
    count > 1 ? `${count} files` : null,
    `${total.triangles.toLocaleString()} triangles`,
    formatBytes(total.bytes),
  ]
    .filter(Boolean)
    .join(" · ")
}

/**
 * What a part measures and what it will weigh, for its row in the checklist.
 *
 * Solid, matching the Weight row above rather than the infill one, so the
 * parts add up to the total instead of to a figure that may not be on screen.
 */
function partMeasure(piece) {
  const [x, y, z] = piece.geometry.bounds.size
  const { grams } = estimateWeight(piece.geometry, 1)
  return `${round(x)} × ${round(y)} × ${round(z)} mm · ${formatGrams(grams)}`
}

function splitOnce(text, separator) {
  const index = text.indexOf(separator)
  return index === -1 ? [text, null] : [text.slice(0, index), text.slice(index + 1).trim()]
}

const round = (value) => (Math.round(value * 10) / 10).toString()

function formatMs(ms) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const percent = (fraction) => `${Math.round(fraction * 100)}%`

// Small parts want a decimal, larger ones don't; nobody needs "127.4 g".
function formatGrams(grams) {
  if (grams < 1) return `${grams.toFixed(2)} g`
  if (grams < 10) return `${grams.toFixed(1)} g`
  return `${Math.round(grams)} g`
}

function formatPrice(grams) {
  const dollars = (grams / 1000) * PRICE_PER_KG
  // Plenty of these parts cost less than a cent, and "$0.00" reads as free.
  return dollars < 0.01 ? "under a cent" : `$${dollars.toFixed(2)}`
}

// Same shape as slugify, but keeps a trailing hyphen so typing "two words"
// doesn't fight the user by eating the separator mid-word.
function slugifyLive(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-/, "")
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}
