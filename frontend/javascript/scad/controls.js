// Builds the parameter form from the schema the Ruby side parsed out of the
// .scad file. Nothing here knows about any particular model — add a parameter
// to a .scad file and the matching control appears.
//
// A number with a declared range gets a slider paired with a number box: the
// slider for exploring, the box for typing an exact measurement, since these
// are real millimetres that have to match real hardware.

import { convertible, inchLabel, snapTarget, toInches } from "./units.js"

const GROUP_OPEN_BY_DEFAULT = 2 // later sections start collapsed

export class Controls {
  /**
   * @param {HTMLElement} container
   * @param {object} schema parsed model schema
   * @param {(name: string, value: any) => void} onChange fires per edit
   */
  constructor(container, schema, onChange) {
    this.container = container
    this.schema = schema
    this.onChange = onChange
    this.inputs = new Map() // name -> {set(value)}
    this.render()
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

    // The inch equivalent shares the label's line, sitting above the number
    // box rather than beside it. Turning the switch on then changes nothing
    // about the width of the control row — the sliders stay where they were.
    //
    // It's a button because an approximate reading is also an offer: press it
    // and the value becomes exactly the fraction it was rounding to. Disabled
    // when there's nothing to snap to, which is most of the time.
    const readout = convertible(parameter) ? element("button", "scad-inches") : null
    if (readout) readout.type = "button"

    const heading = element("div", "scad-label-row")
    heading.append(label)
    if (readout) heading.append(readout)
    field.append(heading)

    field.append(this.buildControl(parameter, id, readout))

    if (parameter.description) {
      field.append(element("p", "scad-help", parameter.description))
    }
    return field
  }

  buildControl(parameter, id, readout) {
    switch (parameter.type) {
      case "boolean": return this.buildBoolean(parameter, id)
      case "enum": return this.buildEnum(parameter, id)
      case "vector": return this.buildVector(parameter, id)
      case "number": return this.buildNumber(parameter, id, readout)
      default: return this.buildText(parameter, id)
    }
  }

  buildNumber(parameter, id, readout = null) {
    const wrapper = element("div", "scad-number")
    const hasRange = parameter.min !== undefined && parameter.max !== undefined
    const step = parameter.step ?? inferStep(parameter)

    const box = element("input", "scad-number-box")
    box.type = "number"
    box.id = id
    box.step = String(step)
    // Deliberately no min/max here. The slider's range is a suggestion of where
    // the useful values live, not a limit — if you need 7000 where the slider
    // stops at 5000, type it. Dragging the slider afterwards snaps back inside.
    box.value = String(parameter.default)

    const slider = hasRange ? element("input", "scad-slider") : null

    // The exact millimetre value behind the current approximate reading, or
    // null when there's nothing worth snapping to. Kept here so the readout's
    // click handler and its appearance stay in agreement.
    let snap = null

    // Keeps the row's appearance in step with the value: the inch equivalent,
    // whether that reading can be snapped to exactly, and a mark when the value
    // sits outside the slider's range so it's clear why the handle has stopped.
    const reflect = (value) => {
      const beyond = hasRange && (value < parameter.min || value > parameter.max)
      wrapper.classList.toggle("is-beyond", beyond)
      wrapper.title = beyond
        ? `Outside the usual range of ${parameter.min}–${parameter.max}. The slider stops at the edge; the value stands.`
        : ""
      if (!readout) return

      const { text, decimal } = toInches(value)
      readout.textContent = inchLabel(value)
      snap = snapTarget(value)
      readout.disabled = !snap
      readout.title = snap
        ? `Snap to exactly ${snap.label} — ${snap.mm} mm`
        : text === decimal
          ? ""
          : decimal
    }

    // One path for every way the value can change: put it in both inputs,
    // refresh the row, tell the customizer. The slider pins itself to whichever
    // end it can reach when the value is outside its range; the value stands.
    const apply = (value) => {
      box.value = String(value)
      if (slider) slider.value = String(value)
      reflect(value)
      this.emit(parameter, value)
    }

    readout?.addEventListener("click", () => {
      if (snap) apply(snap.mm)
    })

    if (slider) {
      slider.type = "range"
      slider.min = String(parameter.min)
      slider.max = String(parameter.max)
      slider.step = String(step)
      slider.value = String(parameter.default)
      slider.setAttribute("aria-label", parameter.label)
      slider.addEventListener("input", () => apply(Number(slider.value)))
      wrapper.append(slider)
    }

    box.addEventListener("change", () => {
      const value = Number(box.value)
      if (Number.isFinite(value)) apply(value)
    })
    wrapper.append(box)

    reflect(parameter.default)

    this.inputs.set(parameter.name, {
      set(value) {
        box.value = String(value)
        if (slider) slider.value = String(value)
        reflect(value)
      },
    })
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
