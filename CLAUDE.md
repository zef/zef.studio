# Working on zef.studio

Zef's personal site. Bridgetown, ERB, Sass, handcoded design he cares about.
Photos and other large binaries go through git-lfs.

## The one hard rule

**Never write first-person prose as Zef's own.** No invented anecdotes,
opinions, memories or motivations in his voice — this is a personal site under
his name, and readers take it as autobiography. Technical writing in my own
voice (docs, code comments, READMEs, commit messages) is fine and welcome.

If a first-person sample genuinely helps show the shape of a page, mark it
unmistakably as generated: a flag in the front matter, a visible notice on the
page, and a build warning. See `src/_models/*.md` and the `placeholder_prose`
handling in `plugins/builders/scad_models.rb` for the pattern. Prefer leaving a
clearly-labelled gap for him to fill over filling it convincingly.

## Design preferences, learned from review

- **Title Case for buttons.** "Copy Link", "All Models", "View Source".
- **Intentional breakpoints, not fluid layouts.** Things should snap between
  deliberate states rather than stretching continuously. The card grids step
  1 → 2 → 3 columns while the card itself stays ~300px at every width.
- **Reading measure is protected.** Prose stays at `$contentWidth` (624px,
  which measures ~90 characters at 17px Calluna — already at the top of the
  comfortable range). Only grids and the model customizer take the wider
  measure, and the header matches whatever the page's content needs.
- **Explanatory text goes below what it explains**, not beside it in a narrow
  column.
- **Quiet affordances.** A dotted underline beats a badge. Subtlety over
  shouting, especially for features most visitors will never need.
- He notices vertical alignment, optical centring, and text that is off by a
  few pixels. Measure rather than eyeball.
- Labels should say what a thing *is* — "Download .json", not "Save". Avoid
  jargon a newcomer wouldn't have ("mesh" fails; "the printable file" works).

## How he likes to work

- **Atomic commits**, each one self-contained.
- He asks for the **reasoning and the alternatives**, not just the change. When
  a decision has a real tradeoff, name it and say what it costs.
- He is happy to try something and revert it — "let's go with that for now" is
  an experiment, not a commitment.
- When he reports a bug, **find the actual trigger before fixing**. Twice now
  the obvious theory was wrong and the real cause was elsewhere.
- Don't silently narrow or widen scope. If something adjacent is broken, say so
  and offer, rather than folding it into an unrelated change.

## Traps in this codebase

Each of these cost real time. They are not obvious from reading the code.

- **Generated files must exist before the read.** Bridgetown collects static
  files while reading, so anything a plugin generates during render is only
  published on the *following* build. Generate in `hook :site, :pre_read`.
- **`plugins/builders/` needs the `Builders::` namespace.** Zeitwerk expects
  `Builders::Thing` for `plugins/builders/thing.rb`. Plugins in `plugins/` are
  top-level.
- **`resource.data.title` is always set** — Bridgetown derives it from the
  filename — so `||=` never fires. Compare against `slug.titleize` to detect
  the automatic one.
- **ERB `<%=` escapes HTML.** Embedding JSON in a `<script>` needs
  `.html_safe`, plus neutralising `</`.
- **Only the Sass bundle is linked into pages.** CSS imported from
  `index.js` is extracted to a file nothing references. Import stylesheets from
  `index.sass` instead — the photoswipe imports at its foot are the pattern.
- **`box-sizing` is not globally `border-box`.** An input with `width: 100%`
  plus padding is wider than its container.
- **`[hidden]` loses to any explicit `display`.** Flex containers need an
  explicit `display: none` rule to honour it.
- **git-lfs pointers masquerade as corrupt files.** A file that "is not a known
  file format" is often an unfetched pointer; check with `head -c 20` before
  debugging the code that reads it.
- **WASM renders in the in-app preview browser run ~6x slower than in Node.**
  A model that takes 0.7 s from `scad-render.mjs` reports 4–5 s on the page
  there. It is the sandboxed browser, not the code — measure an untouched
  model before chasing a regression that isn't one.
- **Stack size is per-thread and the browsers disagree wildly.** Measured in
  each browser with a recursive WASM function:

  |            | main thread | worker |
  |------------|-------------|--------|
  | Chrome     | 15,503      | 7,943  |
  | Safari 27  | 262,144     | **555** |

  555 frames is too few for OpenSCAD to evaluate anything, so every model
  failed in Safari until the customizer learned to retry on the main thread.
  Nesting is what costs — `attach()` chains, module wrapping — not facet
  count; `$fn` makes no difference.

  Measure models with `node --stack-size=N`. Do **not** trust `jsc` as a stand
  in for Safari: its shell gave 7,096 where the browser gives 262,144. And do
  not gate behaviour on a synthetic stack probe — WASM tier-up changes frame
  size mid-measurement, so the same probe answered `true` once in six runs
  where the real depth was 555. Only an actual failure is a reliable signal.

  To drive Safari: `safaridriver -p PORT`, then POST to `/session`. It needs
  "Allow remote automation" in the Develop menu *and* Safari fully quit — it
  will not take a session while Safari is open. See `docs/3d-printing.md`.
- **Nothing versions what the worker imports.** `worker.js` gets a cache key
  from the builder; `kernel.js` is a fixed URL, so it must be imported with
  that key passed through or a browser will pair a new worker with a stale
  kernel. A module worker reports that as an error event with no message.
- **Watch out for `git add -A` after a build.** The image pipeline used to
  leave `-1248-1248.jpg` duplicates behind (fixed in `01efa64`); check
  `git status` for generated strays before staging.

## Verifying

There is no test suite. These are the checks that matter:

```bash
bundle exec bridgetown build          # warnings here are real
node esbuild.config.js                # frontend bundle
node scripts/scad-render.mjs --all --presets   # every model and preset renders
```

For anything visible, start the dev server and look at it — at mobile width
too. `docs/3d-printing.md` covers the 3D printing section in depth.
