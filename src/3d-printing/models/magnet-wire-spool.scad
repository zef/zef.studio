// Magnet Wire Spool
//
// A little bobbin for winding magnet wire — coils for sensors, pickups,
// electromagnets. Rather than guessing at the flange size, you tell it the
// wire gauge and how many turns you want, and it works out how many layers
// that takes and grows the flanges to suit.
//
// Watch the computed values below the viewer as you change things: they tell
// you what the spool will actually hold.
//
// Print upright. No supports.
//
// scad-web: libraries = BOSL2

include <BOSL2/std.scad>

/* [Winding] */
// scad-web: note = Tell it the wire and the turns you want; the flanges are sized from these.

// Bare diameter of the wire, including its enamel. 22 AWG is about 0.65 mm.
wire_diameter = 0.65; // [0.05:0.01:3]

// How many turns you intend to wind on.
// scad-web: unit = count
target_turns = 100; // [10:10:5000]

/* [Core] */
// scad-web: note = The barrel the coil winds onto.

// Inside diameter of the core — size this to whatever the coil goes around.
core_diameter = 5; // [2:0.1:40]

// Length of the core between the flanges. This is the winding width.
core_length = 16; // [4:0.5:80]

// Core wall thickness.
wall = 0.8; // [0.4:0.05:4]

/* [Flanges] */
// scad-web: note = Sized automatically to clear the finished winding, plus this margin.

// Flange thickness.
flange_thickness = 1.6; // [0.6:0.1:6]

// Extra flange height past the finished winding, so the last layer stays put.
flange_margin = 1.5; // [0:0.1:10]

/* [Quality] */

// Facets per full circle. Higher is smoother, and slower to render.
$fn = 96; // [24:8:180]

/* [Hidden] */

core_od = core_diameter + wall * 2;

// How the winding actually stacks up.
turns_per_layer = floor(core_length / wire_diameter);
layers = ceil(target_turns / turns_per_layer);
winding_depth = layers * wire_diameter;
capacity = turns_per_layer * layers;
flange_od = core_od + winding_depth * 2 + flange_margin * 2;

// Surfaced in the customizer as computed values.
echo(str("Turns per layer: ", turns_per_layer));
echo(str("Layers needed: ", layers));
echo(str("Spool capacity: ", capacity, " turns"));
echo(str("Flange diameter: ", flange_od, " mm"));
echo(str("Wire needed: ", round(target_turns * PI * (core_od + winding_depth) / 10) / 100, " m"));

module spool() {
  // Core.
  tube(h = core_length, id = core_diameter, od = core_od, anchor = CTR);

  // A flange at each end, flaring out from the core.
  zflip_copy(offset = core_length / 2)
    tube(h = flange_thickness, id = core_diameter, od1 = core_od, od2 = flange_od, anchor = BOT);
}

spool();
