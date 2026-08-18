// Highlights code blocks that Rouge couldn't handle at build time.
//
// Registering a grammar here makes it available everywhere: in posts, via a
// ```<language> fence, and to any script that imports `highlight`.
import { enhanceCodeBlocks } from "./highlight.js"

import "./openscad.js"

const run = () => enhanceCodeBlocks(document)

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run, { once: true })
} else {
  run()
}
