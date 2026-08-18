// Registers the customizer element. Everything it needs is loaded lazily from
// here on, so pages without a model pay only for this file.
import { ScadCustomizer } from "./customizer.js"

if (!customElements.get("scad-customizer")) {
  customElements.define("scad-customizer", ScadCustomizer)
}
