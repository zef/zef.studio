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
const IGNORED = /Could not initialize localization|Compiling design|Top level object|^\s*(Simple|Vertices|Halfedges|Edges|Halffacets|Facets|Volumes|Genus|Status):/

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
      const { source, parameters, libraries, fonts, features, assetBase } = event.data
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
