#!/usr/bin/env node
// Renders a model the same way the website does, from the command line.
//
//   node scripts/scad-render.mjs tile-spacer
//   node scripts/scad-render.mjs tile-spacer --set arms=6 --set arm_length=12 -o /tmp/out.stl
//   node scripts/scad-render.mjs --all          # render every model, report timings
//
import fs from "node:fs"
import path from "node:path"

import { createKernel, inspectSTL, modelDirectives, modelSlugs, readModel } from "./scad-lib.mjs"

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

async function renderModel(slug, params, outputPath) {
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
    console.log(`  \x1b[31m✗\x1b[0m ${slug} — exit ${result.exitCode} (${result.ms} ms)`)
    for (const line of problems.slice(0, 8)) console.log(`      ${line}`)
    if (!problems.length) for (const line of result.log.slice(-6)) console.log(`      ${line}`)
    return { slug, ok: false }
  }

  const info = inspectSTL(result.output)
  const dims = info.size.map((n) => n.toFixed(1)).join(" × ")
  const warnings = result.log.filter((l) => /WARNING/i.test(l))
  console.log(
    `  \x1b[32m✓\x1b[0m ${slug.padEnd(22)} ${String(result.ms).padStart(6)} ms  ` +
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

const slugs = flag("--all") ? modelSlugs() : [argv.find((a) => !a.startsWith("-") && !argv[argv.indexOf(a) - 1]?.startsWith("--set") && argv[argv.indexOf(a) - 1] !== "-o")].filter(Boolean)

if (!slugs.length) {
  console.error("Usage: node scripts/scad-render.mjs <slug> [--set name=value] [-o out.stl] | --all")
  process.exit(1)
}

console.log("")
const results = []
for (const slug of slugs) {
  results.push(await renderModel(slug, parameters(), slugs.length === 1 ? value("-o") : null))
}
const failed = results.filter((r) => !r.ok)
console.log(`\n  ${results.length - failed.length}/${results.length} rendered\n`)
process.exit(failed.length ? 1 : 0)
