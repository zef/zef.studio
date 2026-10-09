// Working in millimetres, in inches, and in both at once.
//
// Two different things kept getting called "the unit", and keeping them apart
// is most of what this module is for:
//
//   the stored unit    what the .scad file holds the number in. The model's
//                      business and fixed: millimetres unless it says
//                      otherwise, and a muzzleloader's caliber says otherwise
//                      because .50 calibre is a number of inches by
//                      definition.
//
//   the working unit   what you type and read. Yours, switchable, and settable
//                      per parameter — because a part can be imperial all over
//                      and still have a wall thickness that is three extrusion
//                      widths and belongs in millimetres.
//
// Everything converts through millimetres, so there is one hop in each
// direction and no accumulating round trips.

export const MM_PER_INCH = 25.4

// A rule is marked to 1/64, so that is as fine as a fraction ever gets here.
const FINEST = 64

// How fine a fraction is worth *reading*. Past sixteenths, a glanced-at
// reading says more as a decimal — nobody takes in "23/64″" at a glance. The
// input box is held to a different standard and uses FINEST, because what you
// type has to be precise and 7/64 is both exact and perfectly typable.
const READABLE_DENOMINATOR = 16

/** Whether a parameter is a length at all, and so has units to switch between. */
export function isLength(parameter) {
  return parameter.type === "number" && (parameter.unit === "mm" || parameter.unit === "inch")
}

/**
 * Whether the page's unit switch may move this parameter.
 *
 * A unit the file declared is a decision; one we assumed is not. So the switch
 * sweeps up everything that didn't say, and leaves alone the ones that did —
 * which can still be changed by hand, one at a time.
 */
export function followsPageUnit(parameter) {
  return isLength(parameter) && !parameter.unit_declared
}

// ------------------------------------------------------------- conversion

/** A stored value as millimetres. Scale only, so it works on steps too. */
export function storedToMm(value, parameter) {
  return parameter.unit === "inch" ? value * MM_PER_INCH : value
}

/** Millimetres back into whatever the model stores. */
export function mmToStored(mm, parameter) {
  return parameter.unit === "inch" ? mm / MM_PER_INCH : mm
}

export function mmTo(mm, unit) {
  return unit === "inch" ? mm / MM_PER_INCH : mm
}

export function mmFrom(value, unit) {
  return unit === "inch" ? value * MM_PER_INCH : value
}

// --------------------------------------------------------------- fractions

/**
 * An inch measurement as a fraction, or null when it isn't worth writing as
 * one. Reduced to the smallest denominator that still lands on a 64th.
 *
 * @returns {{whole: number, numerator: number, denominator: number,
 *            exact: boolean, negative: boolean}|null}
 */
function asFraction(inches, maxDenominator = READABLE_DENOMINATOR) {
  if (!Number.isFinite(inches)) return null

  const negative = inches < 0
  const magnitude = Math.abs(inches)
  const ticks = Math.round(magnitude * FINEST)
  const exact = Math.abs(magnitude * FINEST - ticks) < 1e-9

  // Smaller than the finest marking on a rule. "≈ 0″" is not a reading, and
  // offering to snap a real measurement to nothing is worse than not offering.
  if (ticks === 0 && magnitude > 0) return null

  let numerator = ticks % FINEST
  let denominator = FINEST
  while (numerator > 0 && numerator % 2 === 0) {
    numerator /= 2
    denominator /= 2
  }

  if (numerator > 0 && denominator > maxDenominator) return null

  return { whole: Math.floor(ticks / FINEST), numerator, denominator, exact, negative }
}

/** "3/16", "1 3/8", "2" — the fraction alone, with no inch mark. */
function fractionText({ whole, numerator, denominator, negative }) {
  const sign = negative ? "-" : ""
  if (numerator === 0) return `${sign}${whole}`
  if (whole === 0) return `${sign}${numerator}/${denominator}`
  return `${sign}${whole} ${numerator}/${denominator}`
}

/**
 * How an inch measurement reads.
 *
 * `exact` says the fraction is the value rather than a rounding of it, which
 * is what decides whether a reading gets a ≈ in front and whether there is
 * anything to offer snapping to.
 *
 * @returns {{text: string, exact: boolean, fraction: boolean, decimal: string}}
 */
export function formatInches(inches) {
  if (!Number.isFinite(inches)) return { text: "", exact: false, fraction: false, decimal: "" }

  const decimal = `${trimZeros(inches.toFixed(3))}″`
  const parts = asFraction(inches)
  if (!parts) return { text: decimal, exact: false, fraction: false, decimal }

  return { text: `${fractionText(parts)}″`, exact: parts.exact, fraction: true, decimal }
}

/**
 * Reads a length someone typed, in the unit they are working in.
 *
 * Inches accept the way people actually write them: 3/16, 1 3/8, 1-3/8, .125,
 * and any of those with an inch mark on the end. Returns null for anything it
 * can't make a number of, so the caller can leave the value alone.
 */
export function parseTyped(text, unit) {
  const cleaned = String(text)
    .trim()
    .replace(/(?:″|"|'')\s*$/, "")
    .replace(/\s*(?:in|inch|inches|mm)\s*$/i, "")
    .trim()
  if (!cleaned) return null

  if (unit === "inch") {
    // Optional whole number, then a fraction: "1 3/8", "1-3/8", "3/16".
    const mixed = cleaned.match(/^(-?)\s*(?:(\d+)[\s-]+)?(\d+)\s*\/\s*(\d+)$/)
    if (mixed) {
      const [, sign, whole, numerator, denominator] = mixed
      if (Number(denominator) === 0) return null
      const value = Number(whole || 0) + Number(numerator) / Number(denominator)
      return sign === "-" ? -value : value
    }
  }

  const plain = Number(cleaned)
  return Number.isFinite(plain) ? plain : null
}

// ----------------------------------------------------------------- display

/**
 * The value as it goes into the input box: bare, with no unit mark, since the
 * box has a unit button sitting next to it saying which one it's in.
 *
 * Inches prefer the fraction when the value is exactly one, because that is
 * what someone would have typed and what they will read off a rule.
 */
export function forInput(mm, unit) {
  if (!Number.isFinite(mm)) return ""
  if (unit !== "inch") return trimZeros(mm.toFixed(4))

  const inches = mm / MM_PER_INCH
  const parts = asFraction(inches, FINEST)
  if (parts && parts.exact) return fractionText(parts)
  return trimZeros(inches.toFixed(4))
}

/**
 * Where a measurement sits in inches, and the nearest rule marking to it.
 *
 * Shown whichever unit is being worked in, because it answers a question that
 * survives the switch: a value typed as 0.1874″ is no more obviously 3/16″
 * than 4.76 mm is. The ≈ marks a reading that has been rounded to get there,
 * and that is exactly when there is something to snap to.
 *
 * @returns {{text: string, title: string, snap: {mm: number, label: string}|null}}
 */
export function inchReading(mm) {
  if (!Number.isFinite(mm)) return { text: "", title: "", snap: null }

  const { text, exact, fraction, decimal } = formatInches(mm / MM_PER_INCH)
  if (!text) return { text: "", title: "", snap: null }

  const rounded = fraction && !exact
  const snap = rounded ? snapTarget(mm) : null
  return {
    text: rounded ? `≈ ${text}` : text,
    title: snap ? `Snap to ${snap.label} — ${snap.mm} mm` : text === decimal ? "" : decimal,
    snap,
  }
}

/**
 * The measurement in millimetres, for when the box is showing inches.
 *
 * Four places, matching what the box itself would show after switching units:
 * a reading that disagrees with the box is a bug report waiting to happen.
 */
export function mmReading(mm) {
  return Number.isFinite(mm) ? `${trimZeros(mm.toFixed(4))} mm` : ""
}

/**
 * The exact millimetre value behind an approximate inch reading.
 *
 * A part that has to meet imperial hardware wants the real number: 3/16″ is
 * 4.7625 mm, not 4.7. Offered under exactly the condition that puts the ≈ on
 * the reading, so a value marked approximate always has something to press and
 * one that isn't never does.
 *
 * @returns {{mm: number, label: string}|null}
 */
export function snapTarget(mm) {
  if (!Number.isFinite(mm)) return null
  const { text, exact, fraction } = formatInches(mm / MM_PER_INCH)
  if (exact || !fraction || !text) return null

  const ticks = Math.round((mm / MM_PER_INCH) * FINEST)
  // Four places is past any printer's resolution and keeps 64ths exact.
  return { mm: Number(((ticks / FINEST) * MM_PER_INCH).toFixed(4)), label: text }
}

// The steps a rule is marked in. A slider working in inches should land on
// these rather than on whatever a millimetre step converts to.
const INCH_STEPS = [1 / 64, 1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 1]

/**
 * A slider step in the working unit.
 *
 * Converting a 0.1 mm step straight into inches gives 0.0039″, which is both
 * unreachable on a rule and meaningless to drag to. So in inches the step
 * becomes whichever binary fraction is closest to the one the model asked for
 * — compared in ratio, since steps are a scale rather than a position.
 */
export function stepIn(unit, mmStep) {
  if (unit !== "inch") return mmStep
  const wanted = mmStep / MM_PER_INCH
  if (!(wanted > 0)) return 1 / 64
  return INCH_STEPS.reduce((best, step) =>
    Math.abs(Math.log(step / wanted)) < Math.abs(Math.log(best / wanted)) ? step : best
  )
}

/** The symbol a unit is written with. */
export function unitLabel(unit) {
  return unit === "inch" ? "in" : "mm"
}

function trimZeros(text) {
  // Only ever strip a fractional tail: "100" must not become "1".
  return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text
}
