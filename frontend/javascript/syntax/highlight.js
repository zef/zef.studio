// A very small syntax highlighter.
//
// Rouge already highlights fenced code blocks at build time, and does it well.
// This exists for the two cases it can't cover:
//
//   1. Code that doesn't exist until runtime — the customizer's .scad source
//      changes every time you move a slider, so there's nothing to highlight
//      at build time.
//   2. Languages Rouge has no lexer for. OpenSCAD is one of them.
//
// It deliberately emits Rouge's own class names inside a `.highlight`
// container, so `frontend/styles/syntax-highlighting.css` themes both, and
// swapping that stylesheet restyles the whole site at once. Nothing here
// duplicates a language Rouge already knows.

const languages = new Map()

/**
 * Registers a grammar: an ordered list of [className, sticky RegExp, guard?]
 * rules. The first rule that matches at the cursor wins, so order is the
 * grammar. A null className consumes text without marking it up. A guard is
 * consulted before the pattern is tried, for tokens that only mean something
 * in a particular position — an include path, say.
 *
 * @param {string} name
 * @param {Array<[string|Function|null, RegExp, Function?]>} rules
 */
export function registerLanguage(name, rules) {
  for (const [, pattern] of rules) {
    if (!pattern.sticky) throw new Error(`${name}: rules must use the /y flag`)
  }
  languages.set(name, rules)
}

export function knows(name) {
  return languages.has(name)
}

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;" }
const escapeHTML = (text) => text.replace(/[&<>]/g, (char) => ESCAPES[char])

/**
 * Highlights source into HTML.
 * @param {string} code
 * @param {string} name a registered language
 * @returns {string} HTML — escaped, with Rouge-classed spans
 */
export function highlight(code, name) {
  const rules = languages.get(name)
  if (!rules) return escapeHTML(code)

  let out = ""
  let index = 0
  // Some grammars care what came before — a name after `module` is a
  // definition, the same name elsewhere is a call.
  const context = { previous: null }

  while (index < code.length) {
    let matched = null
    for (const [className, pattern, guard] of rules) {
      if (guard && !guard(context)) continue
      pattern.lastIndex = index
      const result = pattern.exec(code)
      if (result && result[0].length > 0) {
        matched = { className, text: result[0] }
        break
      }
    }

    if (!matched) {
      // Nothing in the grammar applies; pass one character through so an
      // unexpected symbol can never stall the loop.
      out += escapeHTML(code[index])
      index += 1
      continue
    }

    const resolved =
      typeof matched.className === "function"
        ? matched.className(matched.text, context)
        : matched.className

    out += resolved ? `<span class="${resolved}">${escapeHTML(matched.text)}</span>` : escapeHTML(matched.text)
    index += matched.text.length
    if (matched.text.trim()) context.previous = matched.text.trim()
  }

  return out
}

/**
 * Highlights one `<code>` element in place, leaving the surrounding markup
 * alone. The caller decides where `.highlight` belongs — the customizer puts it
 * on a wrapper so it can style the `<pre>` itself.
 */
export function highlightElement(element, name) {
  if (!knows(name)) return false
  element.innerHTML = highlight(element.textContent, name)
  return true
}

/**
 * Highlights code blocks Rouge left alone.
 *
 * Kramdown tags fenced blocks with `language-<name>`, and falls back to plain
 * text for languages it has no lexer for. Those arrive here with no spans in
 * them, which is the signal to have a go.
 */
export function enhanceCodeBlocks(root = document) {
  for (const block of root.querySelectorAll("code[class*='language-']")) {
    if (block.querySelector("span")) continue // Rouge already did this one
    const name = block.className.match(/language-([\w-]+)/)?.[1]
    if (!name || !highlightElement(block, name)) continue

    // Match the markup Rouge emits — <div class="highlight"><pre class=
    // "highlight"><code> — so a block we highlighted is indistinguishable
    // from one it did, and the theme styles both the same way.
    const pre = block.closest("pre")
    if (!pre || pre.closest(".highlight")) continue
    const wrapper = document.createElement("div")
    wrapper.className = "highlight"
    pre.replaceWith(wrapper)
    wrapper.append(pre)
    pre.classList.add("highlight")
  }
}
