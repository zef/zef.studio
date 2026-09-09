# The 3D printing section

OpenSCAD models with a customizer that renders in the visitor's browser. They
pick dimensions, the geometry is built on their machine by a WebAssembly build
of OpenSCAD, and they download the STL. Nothing is uploaded and there's no
server involved beyond serving static files.

## Why build this rather than use something that exists

Thingiverse's Customizer and MakerWorld's parametric models both do a version of
this, and so does the official OpenSCAD playground. What none of them do is the
combination below, which is the reason this exists.

**The geometry is built by real OpenSCAD, on the visitor's machine.** Not an
approximation, not a server-side render queue, not a reimplementation of a
subset of the language in JavaScript. It is the same 2025.03.25 build with the
same Manifold kernel, running the same `.scad` file, so what a visitor
downloads is byte-identical to what comes out of the desktop app. That is also
what makes BOSL2 models work at all — an in-house geometry engine would have to
reimplement the library, and BOSL2 is not small.

**No server, no accounts, no database, nothing uploaded.** The whole section is
static files. There is nothing to run, nothing to pay for, nothing that can
leak, and nothing that stops working when a company loses interest. Shared
configurations live in the URL, so a link is the whole record. Ten years from
now it is still a directory of files on a web server.

**The `.scad` file is the only source of truth.** Parameters, ranges,
descriptions, section groupings and units are read out of the model at build
time using OpenSCAD's own Customizer annotations. There is no parallel schema to
keep in sync, no admin UI, no database row that drifts from the code. Adding a
parameter to a model adds a control to the website. The same annotated file
opens in the desktop Customizer and behaves the same way, and parameter sets
carry in both directions.

**It stays yours.** Uploading a model to a hosting site means accepting their
terms, their layout, their ads, their idea of what a customizer should look
like, and their decision about whether the thing still exists next year. This
version sits inside the site it belongs to, in its typography, under its own
domain.

**Things it can do that a general host can't.** Because the models and the site
are built together, the section knows things a generic customizer can't: the
index grid is rendered from the actual geometry at build time, `echo()` output
surfaces as explained results rather than log spam, the weight estimate accounts
for infill, and imperial equivalents appear next to values because that's what
the workshop this comes out of actually measures in. A model that builds
several pieces offers them as a checklist and hands them over as a folder of
properly-named files — every hosted customizer, and the desktop app, gives you
one part per render and leaves the filing to you.

The honest cost is an 11 MB download the first time someone opens a model, and
a render that takes between a tenth of a second and a second and a half. That
is the price of running a real CAD kernel in a browser instead of pretending to.

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
// scad-web: note = What this group of parameters is for. Optional.

// This description appears under the control.
width = 10;         // [1:0.5:50]     slider, min:step:max
depth = 10;         // [1:50]         slider, min:max
count = 3;          // [1:1:12]       integer slider
style = "round";    // [round, square, hex]        dropdown
corner = "r";       // [r:Rounded, s:Square]       dropdown with labels
label = "HELLO";    // [16]           text, max length
enabled = true;                       checkbox

// Numbers are millimetres unless told otherwise, which is what earns them an
// inch readout. Say so when they aren't: `count`, `ratio`, or `none`.
// scad-web: unit = count
sides = 6;          // [3:1:12]

// `inch` runs the conversion the other way, for the rare value that is
// genuinely imperial — a caliber, a pipe thread. The reading beside it is the
// millimetre equivalent, and it shows whether or not the inches switch is on.
// scad-web: unit = inch
caliber = 0.50;     // [0.30:0.01:0.62]

/* [Hidden] */

// Anything below this heading is internal. So is anything computed from
// another variable — only plain literal assignments become parameters, which
// is the rule OpenSCAD itself applies.
derived = width * 2;
```

Things worth knowing:

- **Slider ranges are suggestions, not limits.** The website lets people type a
  value past either end; the range just sets where the slider is useful. So pick
  a range that makes the slider pleasant to drag rather than one wide enough to
  cover every conceivable case.
- **Dropdown values can't contain commas or colons**, because those separate
  the entries. If a value needs one — a BOSL2 screw spec like `"#8-32,1"` —
  offer the plain part in the dropdown and assemble the rest in the model.
- **`echo()` output is surfaced** under the viewer as "Worked out for you".
  Use `echo(str("Label: ", value))` for anything the model figures out that
  the reader would want to know. See `magnet-wire-spool.scad`.

### Models that build more than one part

A file that builds several pieces — a tube, its cap, a band — usually switches
on a variable. Name that variable and its dropdown becomes an export checklist:

```openscad
// scad-web: parts = part

// The comment here becomes the note under the section heading.
part = "powder_tube"; // [powder_tube:Powder Tube, powder_cap:Powder Cap]
```

There is no new syntax: the annotation is the ordinary one OpenSCAD reads, so
the same file opens in the desktop Customizer as a plain dropdown and renders
one part at a time there. On the website every ticked part is rendered
separately and downloaded under its own name, `<slug>-<part>.stl`, with
several arriving together as a zip. The option's value names the file and its
label names the checkbox, so both come from the same place.

Two things follow from parts being separate downloads:

- **Build each part the way it prints, standing on the plate.** Whoever
  downloads it is going straight to a slicer. `muzzleloader.scad` does this at
  the foot of the file — the modules are built wherever their geometry is
  easiest to describe, then turned and set down.
- **The selector is dropped from the parameter form**, since offering it in two
  places lets the two disagree. It stays in `defaults`, so the downloaded
  `.scad` still has a value for it — the first part you ticked.

A directive naming something that can't serve as a selector — a variable that
doesn't exist, or one with no `// [a:A, b:B]` annotation — leaves the model
working as a single-part one and says so as a build warning.

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

**3. Optionally, photos** of the printed part, in
`src/3d-printing/models/<slug>/`.

A folder named for the model, beside its `.scad` file. Drop JPEGs or PNGs in
and they appear as a gallery at the bottom of the page, opening in the site's
lightbox. Two things are derived from the filename, so there's nothing else to
edit:

- **Order** — files are sorted by name, so prefix them `01-`, `02-` to arrange
  them. The number is stripped from the caption.
- **Caption** — `02-fresh-off-the-plate.jpg` captions as "Fresh off the plate".

Originals are resized to a 700px thumbnail and a 2400px full size in
`src/3d-printing/photos/`, and excluded from the built site, so the originals
can be as large as your camera makes them.

**4. Optionally, presets**, at `src/3d-printing/models/<slug>.json`.

OpenSCAD's native parameter-set format, so you can author these in the desktop
Customizer's "save preset" and drop the file in. On the website a set is named
in two parts — a name and an optional version — which are joined with a hyphen
to form the set key and every download's filename, so `shed-tiles` at `rev-2`
saves as `tile-spacer-shed-tiles-rev-2.json`:

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
node scripts/scad-render.mjs <slug> --part cap   # one part of a multi-part model
```

A model that declares parts builds all of them, since the model is the kit.
Presets are rendered at the default part only: a preset varies the numbers,
every part is built from the same numbers, and the assertions that catch a bad
preset fire whichever part you ask for.

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
  models/        the .scad sources, their preset .json files, and a folder
                 of photographs per model
  photos/        generated photo thumbnails and full sizes
  previews/      generated index thumbnails
src/_models/     the pages
plugins/scad_customizer.rb          parses the annotations
plugins/builders/scad_models.rb     attaches the schema to each page
frontend/javascript/scad/           viewer, controls, parts, sharing, zip (bundled)
frontend/javascript/syntax/         syntax highlighting (site-wide, not just here)
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
- The **weight estimate** is a stand-in for slicing, not a substitute. It takes
  the mesh's enclosed volume and its surface area, treats `surface area × 0.9 mm`
  as the solid shell a slicer would lay down, and fills whatever is left at the
  chosen infill. Parts too thin to have an interior — a 2 mm funnel wall — come
  out all shell, which is correct, and the UI says so rather than showing an
  infill control that would do nothing. Density assumes PLA at 1.24 g/cm³.
- **Several parts download as a zip**, written by `frontend/javascript/scad/zip.js`
  — a few headers around the file bytes, with the platform's own
  `CompressionStream` doing the deflating. A browser can't deliver a set of
  named files from one click otherwise.
- **Rendered parts are cached against the parameter values.** Ticking a part
  you had a moment ago costs nothing; changing any parameter drops the lot,
  since every part is built from the same numbers.
- **One warning is filtered from the page**: `PolySet -> Manifold conversion
  failed`. It comes from BOSL2 differencing against a textured cylinder, and it
  is a note about which internal path OpenSCAD took rather than about the
  geometry — the export is watertight either way, checked by pairing its edges.
  `scad-render.mjs` still reports it, so it stays visible to whoever is adding
  a model.
- **Attached solids that share a whole face need an overlap.** BOSL2 defaults
  `$overlap` to 0, so `attach()` butts them exactly; if the two faces are
  identical the union has nothing to cut against and leaves them both inside
  the solid. `attach(BOT, TOP, overlap=0.01)` fixes it. This is invisible until
  you pair the edges of the export, and slicers mostly paper over it.
- The **source view** is highlighted at runtime by
  `frontend/javascript/syntax/`, because it changes with every parameter and so
  can't be highlighted at build time. Rouge has no OpenSCAD lexer either, so the
  same grammar serves any ```openscad block in a post. It emits Rouge's class
  names, so `syntax-highlighting.css` themes both.
- **Inch conversion is display-only.** The models are millimetres throughout,
  because OpenSCAD is and because mixing units inside a model is how you end up
  with a part that is wrong by a factor of 25.4. Parameters can declare
  `// scad-web: unit = count` (or `ratio`) to opt out of a conversion that would
  be meaningless.
