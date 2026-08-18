// Millimetres to inches, for people who think in inches.
//
// OpenSCAD works in millimetres and so does every model here, but half the
// hardware in a North American workshop is imperial. Rather than convert the
// models, the customizer shows the inch equivalent alongside the value you're
// actually setting — so a 4.76 mm grout line reads as the 3/16" it is.

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

// Below this the value is already imperial for any purpose a printed part
// cares about, and offering to "correct" it would be noise.
const WORTH_SNAPPING_MM = 0.01

/**
 * The exact millimetre value behind an approximate inch readout.
 *
 * A part that has to meet imperial hardware wants the real number — 3/16" is
 * 4.7625 mm, not 4.7 — but only when the readout is already naming a fraction.
 * If it fell back to a decimal there's no tidy value nearby to snap to, and
 * dragging someone to the nearest 64th would be a disservice.
 *
 * @returns {{mm: number, label: string}|null}
 */
export function snapTarget(mm) {
  const { text, exact, fraction } = toInches(mm)
  if (exact || !fraction || !text || !Number.isFinite(mm)) return null

  const ticks = Math.round((mm / MM_PER_INCH) * FINEST)
  const target = (ticks / FINEST) * MM_PER_INCH
  if (Math.abs(target - mm) < WORTH_SNAPPING_MM) return null

  // Four places is past any printer's resolution and keeps 1/64ths exact.
  return { mm: Number(target.toFixed(4)), label: text }
}

/** Which parameters get an inch readout at all. */
export function convertible(parameter) {
  return parameter.type === "number" && parameter.unit === "mm"
}
