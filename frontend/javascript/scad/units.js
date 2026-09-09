// Millimetres to inches, for people who think in inches.
//
// OpenSCAD works in millimetres and so does every model here, but half the
// hardware in a North American workshop is imperial. Rather than convert the
// models, the customizer shows the inch equivalent alongside the value you're
// actually setting — so a 4.76 mm grout line reads as the 3/16" it is.
//
// A few parameters run the other way. A muzzleloader's caliber is a number of
// inches by definition — nobody calls it a 12.7 mm rifle — so the model holds
// it in inches and converts internally. Those get the same treatment mirrored:
// the reading beside them is the millimetre equivalent.

const MM_PER_INCH = 25.4

// A tape measure stops being readable somewhere around sixteenths. Finer
// values are still measured to 1/64 internally, but if the reduced fraction
// needs a bigger denominator than this, the decimal is the clearer answer.
const READABLE_DENOMINATOR = 16
const FINEST = 64

/**
 * Formats a millimetre value as inches.
 *
 * `fraction` says whether the reading is in fraction notation — 3/16″, 1 3/8″,
 * 2″ — or fell back to a decimal. It matters because only a fraction can be
 * *rounded to*: a decimal reading is already as precise as it looks.
 *
 * @returns {{text: string, exact: boolean, fraction: boolean, decimal: string}}
 */
export function toInches(mm) {
  const inches = mm / MM_PER_INCH
  const decimal = `${trimZeros(inches.toFixed(3))}″`

  if (!Number.isFinite(inches)) return { text: "", exact: false, fraction: false, decimal: "" }
  if (inches === 0) return { text: "0″", exact: true, fraction: true, decimal }

  const sign = inches < 0 ? "-" : ""
  const magnitude = Math.abs(inches)

  const ticks = Math.round(magnitude * FINEST)
  const exact = Math.abs(magnitude * FINEST - ticks) < 1e-9

  let numerator = ticks % FINEST
  let denominator = FINEST
  while (numerator > 0 && numerator % 2 === 0) {
    numerator /= 2
    denominator /= 2
  }

  // Too fine to read off a rule — a decimal says more.
  if (numerator > 0 && denominator > READABLE_DENOMINATOR) {
    return { text: decimal, exact, fraction: false, decimal }
  }

  const whole = Math.floor(ticks / FINEST)
  let text
  if (numerator === 0) text = `${whole}″`
  else if (whole === 0) text = `${numerator}/${denominator}″`
  else text = `${whole} ${numerator}/${denominator}″`

  return { text: `${sign}${text}`, exact, fraction: true, decimal }
}

/**
 * The readout shown beside a control.
 *
 * The ≈ marks a fraction the value has been rounded to — it's saying "call it
 * 3/16", not 3/16 exactly". A decimal reading carries no such rounding claim,
 * so it goes bare.
 */
export function inchLabel(mm) {
  const { text, exact, fraction } = toInches(mm)
  if (!text) return ""
  return exact || !fraction ? text : `≈ ${text}`
}

function trimZeros(text) {
  return text.replace(/\.?0+$/, "")
}

/**
 * The exact millimetre value behind an approximate inch readout.
 *
 * A part that has to meet imperial hardware wants the real number — 3/16" is
 * 4.7625 mm, not 4.7. The condition is deliberately the same one that puts the
 * ≈ on the reading: if the label claims to have rounded, this offers to
 * unround it, and if it doesn't claim that, there's nothing to offer. Any gap
 * between the two reads as a broken control — a value marked approximate that
 * won't do anything when you press it.
 *
 * A decimal reading is exempt because it isn't rounding to anything: there's
 * no tidy value nearby, and dragging someone to the nearest 64th would be a
 * disservice rather than a favour.
 *
 * @returns {{mm: number, label: string}|null}
 */
export function snapTarget(mm) {
  const { text, exact, fraction } = toInches(mm)
  if (exact || !fraction || !text || !Number.isFinite(mm)) return null

  const ticks = Math.round((mm / MM_PER_INCH) * FINEST)
  const target = (ticks / FINEST) * MM_PER_INCH
  // Four places is past any printer's resolution and keeps 1/64ths exact.
  return { mm: Number(target.toFixed(4)), label: text }
}

/** Which parameters carry a reading in the other unit system. */
export function convertible(parameter) {
  return parameter.type === "number" && (parameter.unit === "mm" || parameter.unit === "inch")
}

/**
 * A parameter whose reading is shown whatever the inches switch says.
 *
 * The switch means "also show me inches", which is a preference. An
 * inch-valued parameter sitting in a model measured in millimetres is not a
 * preference — the millimetre reading is the context that says how big .50
 * caliber is, and it's worth having either way.
 */
export function alwaysShown(parameter) {
  return parameter.unit === "inch"
}

/**
 * The reading shown beside a control, in whichever direction the parameter
 * needs, along with the exact value it offers to snap to (or null).
 *
 * @returns {{text: string, title: string, snap: {mm: number, label: string}|null}}
 */
export function readout(parameter, value) {
  if (!Number.isFinite(value)) return { text: "", title: "", snap: null }

  if (parameter.unit === "inch") {
    // Nothing to offer here: the value is already exact in its own unit, and
    // rounding an inch measurement to a tidy millimetre would be backwards.
    return { text: `${trimZeros((value * MM_PER_INCH).toFixed(2))} mm`, title: "", snap: null }
  }

  const { text, decimal } = toInches(value)
  const snap = snapTarget(value)
  return {
    text: inchLabel(value),
    title: snap ? `Snap to ${snap.label} — ${snap.mm} mm` : text === decimal ? "" : decimal,
    snap,
  }
}
