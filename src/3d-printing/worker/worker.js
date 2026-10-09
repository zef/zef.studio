// The customizer's render thread.
//
// OpenSCAD runs synchronously and can't be interrupted partway through, so it
// lives out here where a long render can't lock up the page. The main thread
// stays free to keep the viewer spinning and the controls responsive while a
// render is in flight, and can terminate this worker outright to cancel one.
//
// Loaded as a native ES module worker, which is why this file and kernel.js
// are served as-is rather than going through the bundler.

// Imported with this worker's own cache key rather than statically.
//
// The page versions worker.js by a hash of this directory's contents, so a
// change here can't be served stale -- but `./kernel.js` is a fixed URL, and a
// browser will happily keep an old copy of it next to a brand new worker.
// Passing the key through means the pair always move together. Not theoretical:
// it bit during development, with the worker loading against a kernel.js from
// before the exports it was asking for existed.
//
// Deliberately a promise rather than a top-level await: awaiting up here would
// suspend module evaluation past the point where `self.onmessage` is assigned,
// and the page's first message arrives while nothing is listening for it.
const kernelModule = import(`./kernel.js${new URL(self.location.href).search}`)

let kernel = null

function post(message, transfer = []) {
  self.postMessage(message, transfer)
}

async function ensureKernel(assetBase) {
  const { browserAssets, OpenSCADKernel } = await kernelModule
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
      const { extractEchoes, extractProblems, failureProblems } = await kernelModule
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
          problems: failureProblems(result),
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
