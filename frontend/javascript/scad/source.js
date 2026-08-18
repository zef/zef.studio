// Rewrites a .scad file's parameter assignments to a chosen set of values.
//
// Kept apart from the custom element so it is a plain, testable function with
// no DOM behind it.

/**
 * Rewrites a .scad file's top-level assignments to the chosen values, so the
 * downloaded source opens in OpenSCAD showing exactly what was on screen —
 * still readable and still editable, rather than a wall of -D flags.
 */
export function customizeSource(source, values) {
  return source
    .split("\n")
    .map((line) => {
      const match = line.match(/^(\s*)(\$?[A-Za-z_]\w*)(\s*=\s*)([^;]*)(;.*)$/)
      if (!match) return line
      const [, indent, name, equals, , tail] = match
      if (!(name in values)) return line
      return `${indent}${name}${equals}${literal(values[name])}${tail}`
    })
    .join("\n")
}

function literal(value) {
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") return String(value)
  if (Array.isArray(value)) return `[${value.map(literal).join(", ")}]`
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}
