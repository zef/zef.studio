// Builds the parameter form from the schema the Ruby side parsed out of the
// .scad file. Nothing here knows about any particular model — add a parameter
// to a .scad file and the matching control appears.
//
// A number with a declared range gets a slider paired with a number box: the
// slider for exploring, the box for typing an exact measurement, since these
// are real millimetres that have to match real hardware.

import {
  forInput,
  inchReading,
  mmReading,
  isLength,
  mmFrom,
  mmTo,
  mmToStored,
  parseTyped,
  stepIn,
  storedToMm,
  unitLabel,
} from "./units.js"

const GROUP_OPEN_BY_DEFAULT = 2 // later sections start collapsed

export class Controls {
  /**
   * @param {HTMLElement} container
   * @param {object} schema parsed model schema
   * @param {(name: string, value: any) => void} onChange fires per edit
   */
  constructor(container, schema, onChange, pageUnit = "mm") {
    this.container = container
    this.schema = schema
    this.onChange = onChange
    this.pageUnit = pageUnit
    this.inputs = new Map() // name -> {set(value)}
    this.units = new Map() // name -> {pageUnitChanged(unit)}, lengths only
    this.render()
  }

  /**
   * Switches what the page is worked in.
   *
   * Only parameters that never declared a unit follow; the rest were already
   * decided, by the model or by hand, and each keeps its own switch.
   */
  setPageUnit(unit) {
    this.pageUnit = unit
    for (const control of this.units.values()) control.pageUnitChanged(unit)
  }

  get parameters() {
    return this.schema.groups.flatMap((group) => group.parameters)
  }

  render() {
    this.container.textContent = ""
    this.schema.groups.forEach((group, index) => {
      this.container.append(this.renderGroup(group, index < GROUP_OPEN_BY_DEFAULT))
    })
  }

  renderGroup(group, open) {
    const details = element("details", "scad-group")
    details.open = open

    const summary = element("summary")
    summary.append(element("span", "scad-group-name", group.name))
    details.append(summary)

    const body = element("div", "scad-group-body")
    // A section can explain itself, via `// scad-web: note =` in the .scad file.
    if (group.note) body.append(element("p", "scad-group-note", group.note))
    for (const parameter of group.parameters) {
      body.append(this.renderParameter(parameter))
    }
    details.append(body)
    return details
  }

  renderParameter(parameter) {
    const field = element("div", "scad-field")
    field.dataset.type = parameter.type

    const id = `scad-${parameter.name.replace(/\W/g, "_")}`
    const label = element("label", "scad-label", parameter.label)
    label.htmlFor = id

    // The same measurement in the other unit, sharing the label's line so that
    // showing or hiding it can't move the slider underneath.
    //
    // It's a button because an approximate reading is also an offer: press it
    // and the value becomes exactly the fraction it was rounding to. Disabled
    // when there's nothing to snap to, which is most of the time.
    const lengthy = isLength(parameter)
    const readout = lengthy ? element("button", "scad-inches") : null
    if (readout) readout.type = "button"
    // The millimetre value, for when the box is showing inches. Separate from
    // the reading above because it is a plain fact rather than an offer.
    const metric = lengthy ? element("span", "scad-mm") : null

    const heading = element("div", "scad-label-row")
    heading.append(label)
    if (readout) heading.append(readout)
    if (metric) heading.append(metric)
    field.append(heading)

    field.append(this.buildControl(parameter, id, readout, metric))

    if (parameter.description) {
      field.append(element("p", "scad-help", parameter.description))
    }
    return field
  }

  buildControl(parameter, id, readout, metric) {
    switch (parameter.type) {
      case "boolean": return this.buildBoolean(parameter, id)
      case "enum": return this.buildEnum(parameter, id)
      case "vector": return this.buildVector(parameter, id)
      case "number": return this.buildNumber(parameter, id, readout, metric)
      default: return this.buildText(parameter, id)
    }
  }

  buildNumber(parameter, id, readout = null, metric = null) {
    const wrapper = element("div", "scad-number")
    const hasRange = parameter.min !== undefined && parameter.max !== undefined
    const lengthy = isLength(parameter)

    // A length is tracked in millimetres inside this control whatever the
    // model stores it as and whatever the reader is typing, so there is one
    // number to reason about and conversion happens only at the edges.
    const canonical = (stored) => (lengthy ? storedToMm(stored, parameter) : stored)
    const stored = (value) => (lengthy ? mmToStored(value, parameter) : value)
    const display = (value) => (lengthy ? mmTo(value, unit) : value)

    const lowest = hasRange ? canonical(parameter.min) : undefined
    const highest = hasRange ? canonical(parameter.max) : undefined
    const declaredStep = parameter.step ?? inferStep(parameter)
    const stepSize = canonical(declaredStep)

    /**
     * The slider's step, in whatever unit is being worked in.
     *
     * Only a step that has to be *converted* gets rebuilt. A model that asks
     * for 0.01 of its own unit means it — calibers come in hundredths of an
     * inch, and rounding that onto a 1/64 grid would step straight past .50.
     * It is converting a millimetre step into inches that needs help, because
     * 0.1 mm lands on 0.0039″, which is neither reachable on a rule nor
     * meaningful to drag to.
     */
    const workingStep = () => {
      if (!lengthy || unit === parameter.unit) return declaredStep
      return unit === "inch" ? stepIn("inch", stepSize) : stepSize
    }

    // The unit this parameter is being worked in, and whether the page switch
    // is allowed to move it. A unit the file declared is already a decision;
    // so is one the reader made by hand.
    let unit = lengthy ? (parameter.unit_declared ? parameter.unit : this.pageUnit) : null
    let pinned = Boolean(parameter.unit_declared)
    let value = canonical(parameter.default)
    let snap = null

    const box = element("input", "scad-number-box")
    box.id = id
    // Deliberately no min/max. The slider's range says where the useful values
    // live, not where they stop — if you need 7000 where the slider ends at
    // 5000, type it. Dragging afterwards snaps back inside; the value stands.
    const slider = hasRange ? element("input", "scad-slider") : null
    if (slider) {
      slider.type = "range"
      slider.setAttribute("aria-label", parameter.label)
    }

    // Shown as the unit it is rather than an arrow, because the label is the
    // thing worth knowing and the switch is the bonus.
    const unitButton = lengthy ? element("button", "scad-unit") : null
    if (unitButton) unitButton.type = "button"

    const sizeInputs = () => {
      // Inches want their fractions, which no number input will hold.
      box.type = lengthy && unit === "inch" ? "text" : "number"
      if (box.type === "text") {
        box.inputMode = "decimal"
        box.removeAttribute("step")
      } else {
        box.step = String(workingStep())
      }
      if (!slider) return
      slider.min = String(display(lowest))
      slider.max = String(display(highest))
      slider.step = String(workingStep())
    }

    // Everything the row shows, derived from the one value it holds.
    const reflect = () => {
      box.value = lengthy ? forInput(value, unit) : String(value)
      if (slider) slider.value = String(display(value))

      const beyond = hasRange && (value < lowest || value > highest)
      wrapper.classList.toggle("is-beyond", beyond)
      wrapper.title = beyond
        ? `Outside the usual range of ${parameter.min}–${parameter.max}. The slider stops at the edge; the value stands.`
        : ""

      if (unitButton) {
        unitButton.textContent = unitLabel(unit)
        unitButton.title = `Working in ${unit === "inch" ? "inches" : "millimetres"}. Switch this one to ${
          unit === "inch" ? "millimetres" : "inches"
        }.`
      }
      if (!readout) return

      const reading = inchReading(value)
      readout.textContent = reading.text
      snap = reading.snap
      readout.disabled = !snap
      readout.title = reading.title
      // With inches already in the box, this reading only earns its place when
      // it says something the box doesn't: that the value is *near* a rule
      // marking. An exact fraction is already in the box, and a decimal would
      // just be the box again at lower precision.
      //
      // With millimetres in the box it is the counterpart, and shows whenever
      // the reader has asked for imperial at all.
      readout.classList.toggle(
        "is-shown",
        unit === "inch" ? Boolean(snap) : this.pageUnit === "inch"
      )
      // Millimetres are not a preference: with inches in the box they are the
      // only thing saying how big this actually is.
      metric.textContent = mmReading(value)
      metric.classList.toggle("is-shown", unit === "inch")
    }

    const apply = (next) => {
      value = next
      reflect()
      this.emit(parameter, tidy(stored(value)))
    }

    const setUnit = (next) => {
      unit = next
      sizeInputs()
      reflect()
    }

    unitButton?.addEventListener("click", () => {
      pinned = true
      setUnit(unit === "inch" ? "mm" : "inch")
      box.focus()
    })

    readout?.addEventListener("click", () => {
      if (snap) apply(snap.mm)
    })

    slider?.addEventListener("input", () => {
      const typed = Number(slider.value)
      apply(lengthy ? mmFrom(typed, unit) : typed)
    })

    box.addEventListener("change", () => {
      const typed = lengthy ? parseTyped(box.value, unit) : Number(box.value)
      // Nothing readable in there; put back what the value actually is rather
      // than guessing at a number.
      if (typed === null || !Number.isFinite(typed)) {
        reflect()
        return
      }
      apply(lengthy ? mmFrom(typed, unit) : typed)
    })

    if (slider) wrapper.append(slider)
    wrapper.append(box)
    if (unitButton) wrapper.append(unitButton)

    sizeInputs()
    reflect()

    this.inputs.set(parameter.name, {
      set(next) {
        value = canonical(next)
        reflect()
      },
    })
    if (lengthy) {
      this.units.set(parameter.name, {
        // Pinned parameters still refresh: the page changing unit can change
        // whether their counterpart is worth showing.
        pageUnitChanged: (next) => (pinned ? reflect() : setUnit(next)),
      })
    }
    return wrapper
  }

  buildBoolean(parameter, id) {
    const wrapper = element("div", "scad-toggle")
    const input = element("input")
    input.type = "checkbox"
    input.id = id
    input.checked = Boolean(parameter.default)
    input.addEventListener("change", () => this.emit(parameter, input.checked))
    wrapper.append(input, element("span", "scad-toggle-track"))
    this.inputs.set(parameter.name, { set: (value) => { input.checked = Boolean(value) } })
    return wrapper
  }

  buildEnum(parameter, id) {
    const select = element("select", "scad-select")
    select.id = id
    for (const option of parameter.options) {
      const node = element("option", null, option.label)
      node.value = String(option.value)
      select.append(node)
    }
    select.value = String(parameter.default)
    select.addEventListener("change", () => {
      const chosen = parameter.options.find((option) => String(option.value) === select.value)
      this.emit(parameter, chosen ? chosen.value : select.value)
    })
    this.inputs.set(parameter.name, { set: (value) => { select.value = String(value) } })
    return select
  }

  buildText(parameter, id) {
    const input = element("input", "scad-text")
    input.type = "text"
    input.id = id
    input.value = String(parameter.default ?? "")
    if (parameter.max_length) input.maxLength = parameter.max_length
    // Typed text is cheap to re-render and people expect to see it appear, so
    // fire on input rather than waiting for blur.
    input.addEventListener("input", () => this.emit(parameter, input.value))
    this.inputs.set(parameter.name, { set: (value) => { input.value = String(value ?? "") } })
    return input
  }

  buildVector(parameter, id) {
    const wrapper = element("div", "scad-vector")
    const boxes = parameter.default.map((component, index) => {
      const box = element("input", "scad-number-box")
      box.type = "number"
      if (index === 0) box.id = id
      box.step = "0.1"
      box.value = String(component)
      box.setAttribute("aria-label", `${parameter.label} ${"XYZW"[index] || index + 1}`)
      box.addEventListener("change", () => {
        const values = boxes.map((b) => Number(b.value))
        if (values.every(Number.isFinite)) this.emit(parameter, values)
      })
      wrapper.append(box)
      return box
    })
    this.inputs.set(parameter.name, {
      set(value) {
        value.forEach((component, i) => { if (boxes[i]) boxes[i].value = String(component) })
      },
    })
    return wrapper
  }

  emit(parameter, value) {
    this.onChange(parameter.name, value)
  }

  /** Pushes a whole set of values into the form without firing change events. */
  setValues(values) {
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) continue
      this.inputs.get(name)?.set(value)
    }
  }
}

// Float arithmetic leaves 4.762500000000001 behind; six places is past any
// printer's resolution and matches what the renderer writes out.
function tidy(value) {
  return Number(value.toFixed(6))
}

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

// Without a declared step, pick one from the default's precision so a value
// like 4.76 doesn't get rounded to 5 by the number box.
function inferStep(parameter) {
  const decimals = String(parameter.default).split(".")[1]?.length ?? 0
  return decimals ? 10 ** -decimals : 1
}
