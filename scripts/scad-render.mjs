#!/usr/bin/env node
// Renders a model the same way the website does, from the command line.
//
//   node scripts/scad-render.mjs tile-spacer
//   node scripts/scad-render.mjs tile-spacer --set arms=6 --set arm_length=12 -o /tmp/out.stl
//   node scripts/scad-render.mjs --all          # render every model, report timings
//
// A model that declares parts builds all of them, since the model is the kit.
// `--part powder_cap` narrows that to one. Presets are rendered at the model's
// default part only: a preset varies the numbers, and every part is built from
// the same numbers, so crossing the two would multiply the runtime to prove
// the same thing several times over.
//
import fs from "node:fs"
import path from "node:path"

import {
  createKernel,
  inspectSTL,
  modelDirectives,
  modelParts,
  modelSlugs,
  readModel,
} from "./scad-lib.mjs"

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const value = (name) => {
  const i = argv.indexOf(name)
  return i === -1 ? null : argv[i + 1]
}

// --set name=value, repeatable. Values are parsed as JSON when possible so
// numbers, booleans and vectors all work: --set size=[10,20,3]
function parameters() {
  const params = {}
  argv.forEach((arg, i) => {
    if (arg !== "--set") return
    const [name, ...rest] = (argv[i + 1] || "").split("=")
    const raw = rest.join("=")
    try {
      params[name] = JSON.parse(raw)
    } catch {
      params[name] = raw
    }
  })
  return params
}

const verbose = flag("--verbose")
const kernel = createKernel()

/**
 * Where one part's STL goes when several share an `-o`: the part's name is
 * worked into the filename rather than each overwriting the last.
 */
function outputFor(base, part) {
  if (!base || !part) return base
  const ext = path.extname(base)
  return `${base.slice(0, base.length - ext.length)}-${part.replace(/_/g, "-")}${ext || ".stl"}`
}

async function renderModel(slug, params, outputPath, label = null) {
  const model = readModel(slug)
  const directives = modelDirectives(model.source)
  const result = await kernel.render({
    source: model.source,
    parameters: params,
    libraries: directives.libraries,
    fonts: directives.fonts,
    ...(directives.features ? { features: directives.features } : {}),
    onLog: verbose ? (line) => console.log(`      ${line}`) : undefined,
  })

  if (!result.ok) {
    const problems = result.log.filter((l) => /ERROR|WARNING|Parser error/i.test(l))
    console.log(`  \x1b[31m✗\x1b[0m ${label || slug} — exit ${result.exitCode} (${result.ms} ms)`)
    for (const line of problems.slice(0, 8)) console.log(`      ${line}`)
    if (!problems.length) for (const line of result.log.slice(-6)) console.log(`      ${line}`)
    return { slug, ok: false }
  }

  const info = inspectSTL(result.output)
  const dims = info.size.map((n) => n.toFixed(1)).join(" × ")
  const warnings = result.log.filter((l) => /WARNING/i.test(l))
  console.log(
    `  \x1b[32m✓\x1b[0m ${(label || slug).padEnd(26)} ${String(result.ms).padStart(6)} ms  ` +
      `${String(info.triangles).padStart(7)} tris  ${dims} mm` +
      (warnings.length ? `  \x1b[33m(${warnings.length} warning${warnings.length > 1 ? "s" : ""})\x1b[0m` : "")
  )
  if (warnings.length && verbose) for (const w of warnings.slice(0, 5)) console.log(`      ${w}`)

  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, result.output)
    console.log(`      wrote ${outputPath}`)
  }
  return { slug, ok: true, ms: result.ms, triangles: info.triangles }
}

const slugs = flag("--all") ? modelSlugs() : [argv.find((a) => !a.startsWith("-") && !argv[argv.indexOf(a) - 1]?.startsWith("--set") && argv[argv.indexOf(a) - 1] !== "-o" && argv[argv.indexOf(a) - 1] !== "--part")].filter(Boolean)

/**
 * The parts to render for a model, as [selector value or null, label] pairs.
 * A single-part model, or one whose part was pinned by hand, gets one entry.
 */
function partsToRender(model, params) {
  const parts = modelParts(model.source)
  if (!parts) return [[null, null]]

  const pinned = value("--part") || params[parts.parameter]
  if (pinned) return [[String(pinned), String(pinned)]]

  return parts.options.map((option) => [option.value, option.value])
}

if (!slugs.length) {
  console.error("Usage: node scripts/scad-render.mjs <slug> [--set name=value] [-o out.stl] | --all")
  process.exit(1)
}

console.log("")
const results = []
for (const slug of slugs) {
  const model = readModel(slug)
  const parts = modelParts(model.source)
  const output = slugs.length === 1 ? value("-o") : null

  for (const [part, partLabel] of partsToRender(model, parameters())) {
    const params = part ? { ...parameters(), [parts.parameter]: part } : parameters()
    results.push(
      await renderModel(slug, params, outputFor(output, part), partLabel ? `${slug} · ${partLabel}` : null)
    )
  }

  // --presets also renders every saved parameter set, so a preset that has
  // drifted out of sync with the model gets caught here rather than by a visitor.
  if (flag("--presets")) {
    const { presets } = model
    for (const [name, values] of Object.entries(presets?.parameterSets || {})) {
      const typed = Object.fromEntries(
        Object.entries(values).map(([k, v]) => {
          const n = Number(v)
          return [k, v === "true" || v === "false" ? v === "true" : Number.isFinite(n) && v !== "" ? n : v]
        })
      )
      process.stdout.write("    preset ")
      results.push(await renderModel(slug, { ...parameters(), ...typed }, null, name))
    }
  }
}
const failed = results.filter((r) => !r.ok)
console.log(`\n  ${results.length - failed.length}/${results.length} rendered\n`)
process.exit(failed.length ? 1 : 0)
