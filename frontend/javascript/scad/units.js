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
 * @returns {{text: string, exact: boolean, decimal: string}}
 */
export function toInches(mm) {
  const inches = mm / MM_PER_INCH
  const decimal = `${trimZeros(inches.toFixed(3))}″`

  if (!Number.isFinite(inches)) return { text: "", exact: false, decimal: "" }
  if (inches === 0) return { text: "0″", exact: true, decimal }

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
    return { text: decimal, exact, decimal }
  }

  const whole = Math.floor(ticks / FINEST)
  let text
  if (numerator === 0) text = `${whole}″`
  else if (whole === 0) text = `${numerator}/${denominator}″`
  else text = `${whole} ${numerator}/${denominator}″`

  return { text: `${sign}${text}`, exact, decimal }
}

/** The readout shown next to a control: "≈ 3/16″" when it isn't exact. */
export function inchLabel(mm) {
  const { text, exact } = toInches(mm)
  if (!text) return ""
  return exact ? text : `≈ ${text}`
}

function trimZeros(text) {
  return text.replace(/\.?0+$/, "")
}

/** Which parameters get an inch readout at all. */
export function convertible(parameter) {
  return parameter.type === "number" && parameter.unit === "mm"
}
