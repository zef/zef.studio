// An OpenSCAD grammar for the highlighter.
//
// Rouge has no OpenSCAD lexer, so this fills the gap for both the customizer's
// live source view and any ```openscad block in a post.
//
// It marks what's actually worth picking out of a .scad file at a glance —
// comments, strings, numbers, control words, the built-in solids, and the
// names of things being defined. Call sites are left plain on purpose: a
// model is mostly calls, and colouring them all turns the file into confetti.

import { registerLanguage } from "./highlight.js"

// Words that change control flow or introduce a definition.
const KEYWORDS = [
  "module", "function", "if", "else", "for", "intersection_for", "let", "each",
  "include", "use", "return", "assert", "echo", "true", "false", "undef",
]

// The built-in solids, transforms and operators — the OpenSCAD standard library.
const BUILTINS = [
  // 3D
  "cube", "sphere", "cylinder", "polyhedron", "surface",
  // 2D
  "square", "circle", "polygon", "text", "import",
  // extrusion
  "linear_extrude", "rotate_extrude", "projection",
  // transforms
  "translate", "rotate", "scale", "resize", "mirror", "multmatrix", "color",
  "offset", "hull", "minkowski",
  // booleans
  "union", "difference", "intersection", "render", "children",
  // maths
  "abs", "sign", "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "floor",
  "round", "ceil", "ln", "log", "pow", "sqrt", "exp", "min", "max", "norm",
  "cross", "concat", "lookup", "str", "chr", "ord", "search", "version",
  "version_num", "parent_module", "is_undef", "is_list", "is_num", "is_bool",
  "is_string", "is_function", "len", "rands",
]

const word = (words) => new RegExp(`(?:${words.join("|")})\\b`, "y")

// A name directly after `module` or `function` is being defined, not called.
const nameClass = (_text, context) =>
  context.previous === "module" || context.previous === "function" ? "nf" : null

registerLanguage("openscad", [
  // Comments first: everything else can appear inside one.
  ["c1", /\/\/[^\n]*/y],
  ["cm", /\/\*[\s\S]*?(?:\*\/|$)/y],

  // Strings, escapes and all.
  ["s2", /"(?:[^"\\\n]|\\.)*"?/y],

  // Special variables: $fn, $fa, $t, $children…
  ["nv", /\$[A-Za-z_]\w*/y],

  // Numbers. Float before integer so 1.5 isn't read as 1 then .5.
  ["mf", /\d*\.\d+(?:[eE][+-]?\d+)?|\d+\.\d*(?:[eE][+-]?\d+)?|\d+[eE][+-]?\d+/y],
  ["mi", /\d+/y],

  ["k", word(KEYWORDS)],
  ["nb", word(BUILTINS)],

  // A library path, but only right after include/use — everywhere else the
  // angle brackets are comparisons.
  ["sx", /<[^>\n]*>/y, (context) => context.previous === "include" || context.previous === "use"],

  // Any other identifier — marked only when it's the thing being defined.
  [nameClass, /[A-Za-z_]\w*/y],

  ["o", /[=+\-*/%!<>&|?:^]+/y],
  ["p", /[{}()[\];,.#]/y],

  // Whitespace passes through untouched.
  [null, /\s+/y],
])

export const OPENSCAD = "openscad"
