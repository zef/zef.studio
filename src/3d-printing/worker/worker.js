// The customizer's render thread.
//
// OpenSCAD runs synchronously and can't be interrupted partway through, so it
// lives out here where a long render can't lock up the page. The main thread
// stays free to keep the viewer spinning and the controls responsive while a
// render is in flight, and can terminate this worker outright to cancel one.
//
// Loaded as a native ES module worker, which is why this file and kernel.js
// are served as-is rather than going through the bundler.

import { browserAssets, OpenSCADKernel } from "./kernel.js"

let kernel = null

// OpenSCAD reports echo() output on stderr as `ECHO: "..."`. Models use it to
// surface derived measurements — capacity, overall height — that the customizer
// shows beneath the viewer.
const ECHO = /^ECHO:\s*"?(.*?)"?\s*$/

function extractEchoes(log) {
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
// OpenSCAD falls back, and the exported mesh comes out watertight either way
// (checked by pairing the edges of the export). There is nothing a visitor
// could do about it, so it doesn't belong in a panel of things to fix. It is
// still reported by scripts/scad-render.mjs, where the person who could act
// on it is the one reading.
//
// The trace that follows every failed assertion is dropped for the same
// reason: it only ever says "called by 'assert'", which the message above it
// has already made clear.
const IGNORED = /Could not initialize localization|Compiling design|Top level object|PolySet -> Manifold conversion failed|TRACE: called by 'assert'|^\s*(Simple|Vertices|Halfedges|Edges|Halffacets|Facets|Volumes|Genus|Status):/

function extractProblems(log) {
  return log.filter((line) => /WARNING|ERROR|Parser error|TRACE/i.test(line) && !IGNORED.test(line))
}

function post(message, transfer = []) {
  self.postMessage(message, transfer)
}

async function ensureKernel(assetBase) {
  if (!kernel) kernel = new OpenSCADKernel({ assets: browserAssets(assetBase) })
  await kernel.warmup()
  return kernel
}

self.onmessage = async (event) => {
  const { type, id } = event.data

  try {
    if (type === "warmup") {
      post({ type: "status", stage: "loading" })
      await ensureKernel(event.data.assetBase)
      post({ type: "ready" })
      return
    }

    if (type === "render") {
      // `part` is opaque here: it is whichever piece of a multi-part model this
      // render is for, handed back untouched so the caller can file the result
      // without having to remember what it asked for.
      const { source, parameters, libraries, fonts, features, assetBase, part } = event.data
      const scad = await ensureKernel(assetBase)
      post({ type: "status", stage: "rendering", id })

      const result = await scad.render({
        source,
        parameters,
        libraries,
        fonts,
        ...(features ? { features } : {}),
      })

      if (!result.ok) {
        post({
          type: "failed",
          id,
          part,
          ms: result.ms,
          problems: extractProblems(result.log),
          log: result.log,
        })
        return
      }

      // Hand the STL over rather than copying it; some of these run to
      // several megabytes.
      const buffer = result.output.buffer
      post(
        {
          type: "rendered",
          id,
          part,
          stl: buffer,
          ms: result.ms,
          echoes: extractEchoes(result.log),
          problems: extractProblems(result.log),
        },
        [buffer]
      )
      return
    }
  } catch (error) {
    post({ type: "failed", id, problems: [error?.message || String(error)], log: [] })
  }
}
