// <scad-customizer> — the whole interactive piece.
//
// Holds the worker that runs OpenSCAD, the WebGL viewer, the generated
// parameter form, presets, URL sharing and downloads. The model schema is
// handed to it as JSON in a <script> tag, so the element itself is generic:
// everything model-specific was parsed out of the .scad file at build time.

import { Controls } from "./controls.js"
import { decodeState, encodeState, replaceHash, shareURL } from "./share.js"
import { customizeSource } from "./source.js"
import { estimateVolume, parseSTL } from "./stl.js"
import { Viewer } from "./viewer.js"

// Once someone opts into the download on any model, other models load without
// asking again — it's already in the browser cache by then.
const OPT_IN_KEY = "scad-customizer-opt-in"
const RENDER_DEBOUNCE_MS = 220

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
      share: find("share"),
      reset: find("reset"),
      recenter: find("recenter"),
    }
  }

  // ------------------------------------------------------------ set-up

  buildControls() {
    this.controls = new Controls(this.el.controls, this.schema, (name, value) => {
      this.values[name] = value
      // Any manual edit means this is no longer "the preset", it's your own.
      this.setActivePreset(null, { keepValues: true })
      this.syncURL()
      this.scheduleRender()
    })

    const presets = this.schema.presets
    if (!presets || !Object.keys(presets).length) {
      this.el.presets.closest("[data-role='presets-panel']")?.remove()
      return
    }
    for (const name of Object.keys(presets)) {
      const button = document.createElement("button")
      button.type = "button"
      button.className = "scad-preset"
      button.textContent = name
      button.addEventListener("click", () => this.applyPreset(name))
      this.el.presets.append(button)
    }
  }

  applyInitialState() {
    this.applyHashState({ render: false })

    // Changing only the hash doesn't reload the page, so following a shared
    // link to the model you're already looking at — or using back and forward —
    // has to be handled here. Our own updates go through replaceState, which
    // deliberately doesn't fire this.
    this.onHashChange = () => this.applyHashState({ render: true })
    window.addEventListener("hashchange", this.onHashChange)
  }

  applyHashState({ render }) {
    const { values, preset } = decodeState(window.location.hash, this.controls.parameters)
    if (preset && this.schema.presets?.[preset]) {
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
    this.el.reset?.addEventListener("click", () => this.reset())
    this.el.recenter?.addEventListener("click", () => this.viewer?.frame())
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
    this.showStats(geometry, bytes.length)
    this.showComputed(echoes)
    this.showProblems(problems)
    this.setDownloadsEnabled(true)
  }

  showFailure({ problems, ms }) {
    this.setStatus(`OpenSCAD couldn't build this${ms ? ` (${formatMs(ms)})` : ""}`, "error")
    this.showProblems(problems?.length ? problems : ["No geometry was produced."])
    this.setDownloadsEnabled(Boolean(this.lastSTL))
  }

  // ------------------------------------------------------------- output

  showStats(geometry, byteLength) {
    const [x, y, z] = geometry.bounds.size
    const volume = estimateVolume(geometry) / 1000 // cm³
    // ~1.24 g/cm³ for PLA; near enough to judge whether a change is expensive.
    const grams = volume * 1.24

    this.el.stats.textContent = ""
    for (const [label, value] of [
      ["Size", `${round(x)} × ${round(y)} × ${round(z)} mm`],
      ["Material", `${volume.toFixed(1)} cm³ · about ${grams.toFixed(0)} g`],
      ["Mesh", `${geometry.triangles.toLocaleString()} triangles · ${formatBytes(byteLength)}`],
    ]) {
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
    const preset = this.schema.presets?.[name]
    if (!preset) return
    this.values = { ...this.schema.defaults, ...preset }
    this.controls.setValues(this.values)
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

  reset() {
    this.values = { ...this.schema.defaults }
    this.controls.setValues(this.values)
    this.setActivePreset(null, { keepValues: true })
    this.syncURL()
    this.scheduleRender()
  }

  // -------------------------------------------------------------- share

  currentHash() {
    return encodeState({
      values: this.values,
      defaults: this.schema.defaults,
      preset: this.activePreset,
    })
  }

  syncURL() {
    replaceHash(this.currentHash())
  }

  async copyShareLink() {
    const url = shareURL(this.currentHash())
    const button = this.el.share
    const original = button.textContent
    try {
      await navigator.clipboard.writeText(url)
      button.textContent = "Link copied"
    } catch {
      // Clipboard access can be refused; the URL bar already holds the link.
      button.textContent = "Link is in the address bar"
    }
    setTimeout(() => { button.textContent = original }, 2200)
  }

  // ----------------------------------------------------------- download

  // Downloads end up in a folder alongside other variants of the same part, so
  // the name has to say which one this is: the preset, or what was changed and
  // what to.
  fileStem() {
    const suffix = this.activePreset
      ? slugify(this.activePreset)
      : this.changed()
          .slice(0, 2)
          .map(([name, value]) => `${slugify(name)}-${slugify(value)}`)
          .join("-")
    return [this.schema.slug, suffix].filter(Boolean).join("-")
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
  // opened in the desktop Customizer.
  downloadPreset() {
    const name = this.activePreset || "From the website"
    const values = Object.fromEntries(
      Object.entries(this.values).map(([key, value]) => [key, String(value)])
    )
    const json = JSON.stringify({ fileFormatVersion: "1", parameterSets: { [name]: values } }, null, 2)
    save(new Blob([json], { type: "application/json" }), `${this.schema.slug}.json`)
  }
}

// ------------------------------------------------------------- helpers

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

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}
