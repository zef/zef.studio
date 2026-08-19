// Shareable parameter sets, encoded in the URL.
//
// No database, no shortener, no server: the configuration *is* the link. Only
// values that differ from the model's defaults are written, so a link stays
// short and readable, and stays meaningful if a default later changes — the
// URL says "this much bigger than standard", not a full opaque snapshot.
//
//   /3d-printing/tile-spacer/#spacing=3.18&arms=3&copies=4
//
// A link to an unmodified preset records the preset by name instead, which
// survives tweaks to that preset's values:
//
//   /3d-printing/tile-spacer/#preset=1%2F8%20in%20%E2%80%94%20wall%20tile

// Reserved hash keys. A model parameter with one of these names would be
// shadowed, which is worth knowing but hasn't come up — OpenSCAD models name
// things after dimensions, not after their own metadata. Each is skipped only
// when the model doesn't claim it, so a model that did would still win.
const PRESET_KEY = "preset"
const NAME_KEY = "name"
const VERSION_KEY = "version"

function serialize(value) {
  if (Array.isArray(value)) return `[${value.join(",")}]`
  if (typeof value === "boolean") return value ? "true" : "false"
  return String(value)
}

function parse(raw, parameter) {
  if (!parameter) return undefined

  switch (parameter.type) {
    case "number": {
      const value = Number(raw)
      return Number.isFinite(value) ? value : undefined
    }
    case "boolean":
      return raw === "true" || raw === "1"
    case "vector": {
      const inner = raw.replace(/^\[|\]$/g, "")
      const parts = inner.split(",").map(Number)
      return parts.every(Number.isFinite) ? parts : undefined
    }
    case "enum": {
      // Enum values keep whichever type the schema declared them with.
      const match = parameter.options?.find((option) => String(option.value) === raw)
      return match ? match.value : undefined
    }
    default:
      return raw
  }
}

function nearlyEqual(a, b) {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-9
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, i) => nearlyEqual(value, b[i]))
  }
  return a === b
}

/**
 * Builds the hash fragment for the current state.
 * @returns {string} e.g. "#arms=3" or "" when everything is at its default
 */
export function encodeState({ values, defaults, preset = null, name = null, version = null }) {
  const params = new URLSearchParams()
  if (preset) {
    params.set(PRESET_KEY, preset)
  } else {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) continue
      if (nearlyEqual(value, defaults[key])) continue
      params.set(key, serialize(value))
    }
  }
  // What you called this configuration travels with it, so the person opening
  // the link sees your name for it rather than "customized".
  if (name) params.set(NAME_KEY, name)
  if (version) params.set(VERSION_KEY, version)
  const query = params.toString()
  return query ? `#${query}` : ""
}

/**
 * Reads a hash fragment back into parameter values.
 * @param {string} hash
 * @param {object[]} parameters flat schema list
 * @returns {{values: object, preset: string|null, name: string|null, version: string|null}}
 */
export function decodeState(hash, parameters) {
  const values = {}
  let preset = null
  let name = null
  let version = null
  const text = (hash || "").replace(/^#/, "")
  if (!text) return { values, preset, name, version }

  const byName = new Map(parameters.map((parameter) => [parameter.name, parameter]))
  for (const [key, raw] of new URLSearchParams(text)) {
    if (key === PRESET_KEY) {
      preset = raw
      continue
    }
    if (key === NAME_KEY && !byName.has(NAME_KEY)) {
      name = raw
      continue
    }
    if (key === VERSION_KEY && !byName.has(VERSION_KEY)) {
      version = raw
      continue
    }
    const value = parse(raw, byName.get(key))
    if (value !== undefined) values[key] = value
  }
  return { values, preset, name, version }
}

/** Replaces the hash without adding a history entry for every slider nudge. */
export function replaceHash(hash) {
  const url = `${window.location.pathname}${window.location.search}${hash}`
  window.history.replaceState(null, "", url)
}

/** The full URL to hand someone else. */
export function shareURL(hash) {
  return `${window.location.origin}${window.location.pathname}${window.location.search}${hash}`
}
