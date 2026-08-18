# The 3D printing section

OpenSCAD models with a customizer that renders in the visitor's browser. They
pick dimensions, the geometry is built on their machine by a WebAssembly build
of OpenSCAD, and they download the STL. Nothing is uploaded and there's no
server involved beyond serving static files.

## Adding a model

Two files, and the second one is short.

**1. The model**, at `src/3d-printing/models/<slug>.scad`.

Annotate it with OpenSCAD's own Customizer syntax. The website reads the same
annotations the desktop Customizer panel does, so there's one source of truth
and it's the `.scad` file:

```openscad
// Title Of The Model
//
// The paragraphs under the title become the summary shown on the page and in
// the index grid. Say what the part is for and how it prints.
//
// scad-web: libraries = BOSL2
// scad-web: fonts = true

include <BOSL2/std.scad>

/* [A Section] */

// This description appears under the control.
width = 10;         // [1:0.5:50]     slider, min:step:max
depth = 10;         // [1:50]         slider, min:max
count = 3;          // [1:1:12]       integer slider
style = "round";    // [round, square, hex]        dropdown
corner = "r";       // [r:Rounded, s:Square]       dropdown with labels
label = "HELLO";    // [16]           text, max length
enabled = true;                       checkbox

/* [Hidden] */

// Anything below this heading is internal. So is anything computed from
// another variable — only plain literal assignments become parameters, which
// is the rule OpenSCAD itself applies.
derived = width * 2;
```

Two things worth knowing:

- **Dropdown values can't contain commas or colons**, because those separate
  the entries. If a value needs one — a BOSL2 screw spec like `"#8-32,1"` —
  offer the plain part in the dropdown and assemble the rest in the model.
- **`echo()` output is surfaced** under the viewer as "Worked out for you".
  Use `echo(str("Label: ", value))` for anything the model figures out that
  the reader would want to know. See `magnet-wire-spool.scad`.

**2. The page**, at `src/_models/<slug>.md`.

Front matter and prose. The title, summary and preview image all default from
the model, so this is really just the writing:

```markdown
---
date: 2026-01-30 12:00
material: PETG
---

Why this part exists, what you learn from printing it, which parameter is the
one that actually matters.
```

**3. Optionally, presets**, at `src/3d-printing/models/<slug>.json`.

OpenSCAD's native parameter-set format, so you can author these in the desktop
Customizer's "save preset" and drop the file in:

```json
{
  "fileFormatVersion": "1",
  "parameterSets": {
    "A useful starting point": { "width": "20", "style": "hex" }
  }
}
```

## Checking your work

```bash
node scripts/scad-render.mjs <slug>
```

Renders the model the same way the website does and reports timing, triangle
count and bounding box. Useful flags:

```bash
node scripts/scad-render.mjs <slug> --set width=25 --set style='"hex"' -o /tmp/out.stl
node scripts/scad-render.mjs --all --presets     # every model and every preset
node scripts/scad-render.mjs <slug> --verbose    # show OpenSCAD's own output
```

Run `--all --presets` before pushing. A preset that has drifted out of sync
with its model is the easiest thing to break and the least visible.

Then generate the index thumbnail:

```bash
node scripts/scad-preview.mjs <slug>
```

Previews are committed to `src/3d-printing/previews/`. They're rendered by a
small software rasterizer in `scad-preview.mjs`, so this needs no GPU and no
image library.

## Updating the vendored OpenSCAD, BOSL2 or fonts

```bash
node scripts/scad-assets.mjs --force
```

Versions are pinned at the top of that script. Bump them deliberately: a new
OpenSCAD build can change geometry, and every model on the site is rendered by
it. Re-run `scad-render.mjs --all --presets` afterward and check the triangle
counts haven't moved unexpectedly.

`src/3d-printing/ASSETS.json` records what's currently vendored.

## How it fits together

```
src/3d-printing/
  runtime/       vendored OpenSCAD WebAssembly build
  libraries/     BOSL2, comment-stripped and packed into one JSON file
  fonts/         DejaVu, for models that emboss text
  worker/        kernel.js + worker.js — plain ES modules, served as-is
  models/        the .scad sources and their preset .json files
  previews/      generated index thumbnails
src/_models/     the pages
plugins/scad_customizer.rb          parses the annotations
plugins/builders/scad_models.rb     attaches the schema to each page
frontend/javascript/scad/           viewer, controls, sharing (bundled)
frontend/styles/_models.sass        styling
```

The worker and kernel are served as static ES modules rather than going through
esbuild, because a module worker needs native `import` to load the OpenSCAD
factory — and it means `scripts/*.mjs` import the exact same kernel file the
website runs, so what those scripts produce is what a visitor gets. They're
cache-busted by a content hash the builder computes.

A few implementation notes that aren't obvious from the code:

- An Emscripten instance is **single-use** — its `main` runs once and the
  runtime is spent. So every render builds a fresh instance, and the expensive
  part, compiling 9 MB of WebAssembly, is done once and reused. That's the
  difference between ~5 ms and ~1 s per render.
- The **Manifold backend** (`--backend=manifold`) is roughly 4x faster than the
  CGAL path on these models. It's why dragging a slider feels interactive.
- BOSL2 is filtered to what the models' `include` graph actually reaches and
  stripped of comments: 3.9 MB becomes 1.55 MB, with byte-identical STL output.
