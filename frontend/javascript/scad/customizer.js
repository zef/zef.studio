// <scad-customizer> — the whole interactive piece.
//
// Holds the worker that runs OpenSCAD, the WebGL viewer, the generated
// parameter form, presets, URL sharing and downloads. The model schema is
// handed to it as JSON in a <script> tag, so the element itself is generic:
// everything model-specific was parsed out of the .scad file at build time.

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
const INCHES_KEY = "scad-customizer-inches"
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
    this.cacheKey = null

    this.batchId = 0
    this.queue = []
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
    this.controls = new Controls(this.el.controls, this.schema, (name, value) => {
      this.values[name] = value
      // Any manual edit means this is no longer "the preset", it's your own.
      this.setActivePreset(null, { keepValues: true })
      this.syncURL()
      this.refreshSource()
      this.scheduleRender()
    })

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

      row.append(box, head, file)
      this.el.parts.append(row)
      this.partRows.set(value, { row, box, measure, file })
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
      row.file.textContent = on ? this.partDownloadName(value) : ""

      const piece = this.cache.get(value)
      row.measure.textContent = on && piece ? partMeasure(piece) : ""
    }
    this.refreshDownloadLabel()
  }

  /** Selected parts, or one nameless part for a model that has no such notion. */
  activeParts() {
    return this.parts ? [...this.selection] : [null]
  }

  missingParts() {
    return this.activeParts().filter((part) => !this.cache.has(part))
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
    this.setInches(localStorage.getItem(INCHES_KEY) === "yes")
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
    this.el.inches?.addEventListener("change", () => this.setInches(this.el.inches.checked))
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
    if (this.worker) return
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

  spawnWorker() {
    this.worker = new Worker(this.workerURL, { type: "module" })
    this.worker.onmessage = (event) => this.handleWorkerMessage(event.data)
    this.worker.onerror = (event) => {
      this.setStatus(`Worker failed: ${event.message || "unknown error"}`, "error")
      this.busy = false
    }
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
    this.worker.postMessage({
      type: "render",
      id: this.batchId,
      part,
      assetBase: this.assetBase,
      source: this.schema.source,
      parameters: this.valuesFor(part),
      libraries: this.schema.libraries,
      fonts: this.schema.fonts,
      features: this.schema.features,
    })
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
      this.setStatus(error.message, "error")
      this.busy = false
      return
    }

    this.cache.set(message.part, {
      part: message.part,
      geometry,
      bytes: new Uint8Array(message.stl),
      ms: message.ms,
      echoes: message.echoes || [],
      problems: message.problems || [],
    })

    // A change arrived while this part was rendering, so the rest of the batch
    // is already answering the wrong question. Start again from the new values.
    if (this.pending) {
      this.showRendered({ final: false })
      this.startBatch()
      return
    }

    const final = !this.queue.length
    this.showRendered({ final })
    if (final) this.busy = false
    else this.renderNext()
  }

  /**
   * Draws whatever has been rendered so far.
   *
   * Called after every part rather than only at the end of a batch, so a kit
   * fills in piece by piece instead of showing nothing for several seconds.
   */
  showRendered({ final }) {
    const pieces = this.renderedPieces()
    if (!pieces.length) return

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

    this.refreshPartRows()
    this.refreshStats()

    if (!final) return
    this.setStatus(this.doneLabel(pieces), "ok")
    this.showComputed(pieces.flatMap((piece) => piece.echoes))
    this.showProblems(pieces.flatMap((piece) => piece.problems))
    this.setDownloadsEnabled(true)
    this.refreshSource()
  }

  doneLabel(pieces) {
    const ms = pieces.reduce((total, piece) => total + piece.ms, 0)
    return pieces.length > 1
      ? `${pieces.length} parts in ${formatMs(ms)}`
      : `Rendered in ${formatMs(ms)}`
  }

  showFailure({ problems, ms, part }) {
    // Every part is built from the same numbers, so one failing usually means
    // they all would. Abandon the rest of the batch rather than repeating the
    // same complaint once per part.
    this.queue = []
    this.busy = false

    const which = part && this.parts ? ` the ${this.partLabel(part)}` : " this"
    this.setStatus(`OpenSCAD couldn't build${which}${ms ? ` (${formatMs(ms)})` : ""}`, "error")
    this.showProblems(problems?.length ? problems : ["No geometry was produced."])
    this.setDownloadsEnabled(Boolean(this.renderedPieces().length))
    if (this.pending) this.startBatch()
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
      // wall of slashes, and lining decimals compare at a glance. Stacked under
      // the millimetres rather than trailing them, so the two read as the same
      // measurement twice instead of one long line.
      const inches = `${dimensions.map((mm) => (mm / 25.4).toFixed(2)).join(" × ")}″`
      rows.push(["Size", this.inchesOn ? [size, inches] : size])
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
      item.textContent = line.replace(/\s+in file .*$/, "")
      panel.append(item)
    }
  }

  setInches(on) {
    this.inchesOn = Boolean(on)
    this.classList.toggle("shows-inches", this.inchesOn)
    if (this.el.inches) this.el.inches.checked = this.inchesOn
    localStorage.setItem(INCHES_KEY, this.inchesOn ? "yes" : "no")
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
    if (this.selection.length > 1) return `${slugify(part)}.stl`
    return `${[this.fileStem(), part ? slugify(part) : null].filter(Boolean).join("-")}.stl`
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
    button.textContent = this.selection.length > 1 ? "Download .zip" : "Download .stl"
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
