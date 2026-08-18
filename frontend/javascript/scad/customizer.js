// <scad-customizer> — the whole interactive piece.
//
// Holds the worker that runs OpenSCAD, the WebGL viewer, the generated
// parameter form, presets, URL sharing and downloads. The model schema is
// handed to it as JSON in a <script> tag, so the element itself is generic:
// everything model-specific was parsed out of the .scad file at build time.

import { Controls } from "./controls.js"
import { decodeState, encodeState, replaceHash, shareURL } from "./share.js"
import { highlight } from "../syntax/highlight.js"
import "../syntax/openscad.js"
import { customizeSource } from "./source.js"
import { estimateWeight, parseSTL } from "./stl.js"
import { Viewer } from "./viewer.js"

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
    this.renderId = 0
    this.pending = false
    this.busy = false
    this.lastSTL = null
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
      presets: find("presets"),
      status: find("status"),
      stats: find("stats"),
      computed: find("computed"),
      problems: find("problems"),
      downloadSTL: find("download-stl"),
      downloadSCAD: find("download-scad"),
      downloadPreset: find("download-preset"),
      presetName: find("preset-name"),
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
    const { values, preset, name } = decodeState(window.location.hash, this.controls.parameters)
    if (name && this.el.presetName) this.el.presetName.value = name

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

  wireButtons() {
    this.el.startButton?.addEventListener("click", () => {
      sessionStorage.setItem(OPT_IN_KEY, "yes")
      this.start()
    })
    this.el.recenter?.addEventListener("click", () => this.viewer?.frame())
    this.el.inches?.addEventListener("change", () => this.setInches(this.el.inches.checked))
    this.el.sourceToggle?.addEventListener("click", () => this.toggleSource())
    this.el.uploadPreset?.addEventListener("change", (event) => this.loadParameterFile(event))
    // Slugify as you type: this becomes a filename, so show what it will be.
    this.el.presetName?.addEventListener("input", () => {
      const field = this.el.presetName
      const caretAtEnd = field.selectionStart === field.value.length
      const cleaned = slugifyLive(field.value)
      if (cleaned !== field.value) {
        field.value = cleaned
        if (caretAtEnd) field.setSelectionRange(cleaned.length, cleaned.length)
      }
      this.syncURL()
    })
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
        if (message.id === this.renderId) this.showResult(message)
        this.finishRender()
        break
      case "failed":
        if (message.id === this.renderId) this.showFailure(message)
        this.finishRender()
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
    // run it the moment the current one lands.
    if (this.busy) {
      this.pending = true
      return
    }
    this.busy = true
    this.pending = false
    this.renderId += 1
    this.setStatus("Rendering…", "busy")

    this.worker.postMessage({
      type: "render",
      id: this.renderId,
      assetBase: this.assetBase,
      source: this.schema.source,
      parameters: this.values,
      libraries: this.schema.libraries,
      fonts: this.schema.fonts,
      features: this.schema.features,
    })
  }

  finishRender() {
    this.busy = false
    if (this.pending) this.render()
  }

  showResult({ stl, ms, echoes, problems }) {
    const bytes = new Uint8Array(stl)
    this.lastSTL = bytes

    let geometry
    try {
      geometry = parseSTL(stl)
    } catch (error) {
      this.setStatus(error.message, "error")
      return
    }

    const first = !this.viewer.geometry
    this.viewer.setGeometry(geometry)
    if (first) this.viewer.frame()
    else this.viewer.frameIfNeeded()

    this.setStatus(`Rendered in ${formatMs(ms)}`, "ok")
    this.lastGeometry = geometry
    this.lastBytes = bytes.length
    this.refreshStats()
    this.showComputed(echoes)
    this.showProblems(problems)
    this.setDownloadsEnabled(true)
    this.refreshSource()
  }

  showFailure({ problems, ms }) {
    this.setStatus(`OpenSCAD couldn't build this${ms ? ` (${formatMs(ms)})` : ""}`, "error")
    this.showProblems(problems?.length ? problems : ["No geometry was produced."])
    this.setDownloadsEnabled(Boolean(this.lastSTL))
  }

  // ------------------------------------------------------------- output

  refreshStats() {
    const geometry = this.lastGeometry
    if (!geometry) return

    const [x, y, z] = geometry.bounds.size
    const solid = estimateWeight(geometry, 1)
    const sparse = estimateWeight(geometry, TYPICAL_INFILL)

    const size = `${round(x)} × ${round(y)} × ${round(z)} mm`
    // Decimal inches for the size triple: three fractions side by side is a
    // wall of slashes, and lining decimals compare at a glance.
    const inches = geometry.bounds.size.map((mm) => (mm / 25.4).toFixed(2)).join(" × ")
    const rows = [
      ["Size", this.inchesOn ? `${size} · ≈ ${inches}″` : size],
      ["Volume", `${solid.solidVolume.toFixed(1)} cm³ solid`],
      ["Weight", `${formatGrams(solid.grams)} in PLA`],
      [`Weight (${percent(TYPICAL_INFILL)} infill)`, formatGrams(sparse.grams)],
      // Priced off the sparse weight, since that's what you'd actually print.
      ["Price", `${formatPrice(sparse.grams)} @ $${PRICE_PER_KG}/kg`],
      ["STL file", `${geometry.triangles.toLocaleString()} triangles · ${formatBytes(this.lastBytes)}`],
    ]

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
    const useful = (echoes || []).filter(Boolean)
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
    const list = problems || []
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

  /** Shows the source as it would download — with the current values in it. */
  refreshSource() {
    if (!this.el.source || this.el.source.hasAttribute("hidden")) return
    const source = customizeSource(this.schema.source, this.values)
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
    })
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

  // Downloads end up in a folder alongside other variants of the same part, so
  // the name has to say which one this is. Whatever you called the set wins;
  // failing that, the preset it came from, or what was changed and what to.
  fileStem() {
    return [this.schema.slug, this.variantName()].filter(Boolean).join("-")
  }

  variantName() {
    const named = this.parameterSetName()
    if (named !== DEFAULT_SET_NAME) return slugify(named)
    if (this.activePreset && this.activePreset !== AS_DESIGNED) return slugify(this.activePreset)
    return this.changed()
      .slice(0, 2)
      .map(([name, value]) => `${slugify(name)}-${slugify(value)}`)
      .join("-")
  }

  changed() {
    return Object.entries(this.values).filter(
      ([name, value]) => String(value) !== String(this.schema.defaults[name])
    )
  }

  downloadSTL() {
    if (!this.lastSTL) return
    save(new Blob([this.lastSTL], { type: "model/stl" }), `${this.fileStem()}.stl`)
  }

  downloadSCAD() {
    save(
      new Blob([customizeSource(this.schema.source, this.values)], { type: "text/plain" }),
      `${this.fileStem()}.scad`
    )
  }

  // OpenSCAD's own parameter-set format, so a configuration made here can be
  // opened in the desktop Customizer — and read back in below.
  downloadPreset() {
    const name = this.parameterSetName()
    const values = Object.fromEntries(
      Object.entries(this.values).map(([key, value]) => [key, String(value)])
    )
    const json = JSON.stringify({ fileFormatVersion: "1", parameterSets: { [name]: values } }, null, 2)
    save(new Blob([json], { type: "application/json" }), `${this.schema.slug}-${slugify(name)}.json`)
  }

  parameterSetName() {
    return this.el.presetName?.value.trim() || this.activePreset || DEFAULT_SET_NAME
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

function labelled(tag, text) {
  const node = document.createElement(tag)
  node.textContent = text
  return node
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
