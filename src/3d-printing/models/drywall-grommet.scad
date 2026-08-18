// Drywall Grommet
//
// A lined pass-through for cables running between rooms, or for a duct or
// conduit stub. The flange screws to the wall face, the barrel lines the hole
// through the drywall, and the internal ribs grip whatever passes through so
// it can't slide back and forth.
//
// Print flange down, no supports.
//
// scad-web: libraries = BOSL2

include <BOSL2/std.scad>
include <BOSL2/screws.scad>

/* [Opening] */

// Diameter of the hole through the wall. 1-1/8" is 28.6 mm.
hole_diameter = 28.6; // [10:0.1:120]

// Thickness of the wall being passed through. Standard drywall is 12.7 mm.
wall_thickness = 12.7; // [5:0.5:60]

// Wall thickness of the grommet itself.
wall = 1.4; // [0.8:0.05:5]

/* [Flange] */

// How far the flange overhangs past the hole on every side.
flange_overhang = 15; // [3:0.5:50]

// Flange thickness.
flange_thickness = 3; // [1:0.1:10]

// Number of mounting screws around the flange.
screw_count = 3; // [0:1:8]

// Screw spec, in the form used by BOSL2 — for example "#8-32,1" or "M4,10".
screw_type = "#8-32,1"; // [#6-32,1:#6 wood screw, #8-32,1:#8 wood screw, M3,10:M3 machine screw, M4,10:M4 machine screw, M5,12:M5 machine screw]

/* [Grip Ribs] */

// Rings of ribs inside the barrel that grip the cable or conduit.
rib_count = 3; // [0:1:8]

// How far the ribs reach inward.
rib_thickness = 1.6; // [0.4:0.1:6]

// How much of each ring is open. 0.85 leaves short fingers that flex.
rib_gap = 0.85; // [0.4:0.01:0.95]

// Fingers per ring.
rib_fingers = 6; // [3:1:12]

/* [Quality] */

// Facets per full circle. Higher is smoother, and slower to render.
$fn = 72; // [24:8:140]

/* [Hidden] */

barrel_id = hole_diameter - wall * 2;
rib_od = hole_diameter;
rib_id = hole_diameter - rib_thickness * 2;
flange_od = hole_diameter + flange_overhang * 2;
barrel_length = wall_thickness + flange_thickness;

echo(str("Flange diameter: ", flange_od, " mm"));
echo(str("Clear opening: ", rib_count > 0 ? rib_id : barrel_id, " mm"));

module grip_ribs() {
  // Each ring is a full tube with wedges cut out, leaving flexible fingers.
  difference() {
    zcopies(spacing = rib_thickness * 2.5, n = rib_count)
      tube(id = rib_id, od = rib_od, l = rib_thickness, ochamfer2 = rib_thickness / 2, anchor = CTR);

    zrot_copies(n = rib_fingers)
      pie_slice(d = rib_od + 1, ang = 360 / rib_fingers * rib_gap, h = barrel_length * 2, anchor = CTR);
  }
}

module grommet() {
  diff() {
    // Flange, rounded on the outside edge and filleted into the barrel.
    tube(id = barrel_id, od = flange_od, h = flange_thickness, orounding = 1, irounding1 = 2, anchor = BOT) {
      // Barrel through the wall.
      attach(TOP, BOT, overlap = flange_thickness)
        tube(id = barrel_id, od = hole_diameter, h = barrel_length, rounding2 = 1);

      // Mounting screws, countersunk from the front face.
      if (screw_count > 0)
        tag("remove")
          zrot_copies(n = screw_count, d = flange_od - flange_overhang)
            attach(BOT, TOP, overlap = flange_thickness)
              screw_hole(screw_type, head = "flat", anchor = TOP);
    }
  }

  // Ribs live inside the barrel, partway along.
  if (rib_count > 0)
    up(flange_thickness + barrel_length * 0.45)
      grip_ribs();
}

grommet();
