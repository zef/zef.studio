// Cable Clip
//
// A screw-down clip for running cable along a wall, bench leg or pegboard.
// The cable snaps in through the gap at the top and the loop holds it without
// pinching. Sizing the wall by perimeter count instead of millimeters means
// the slicer prints solid walls with no thin-wall gap-fill.
//
// Prints flat on its back, no supports.
//
// scad-web: libraries = BOSL2

include <BOSL2/std.scad>

/* [Cable] */
// scad-web: note = Measure the cable jacket; the loop is built around it.

// Diameter of the cable, plus whatever clearance you want. Measure the jacket.
cable_diameter = 3.3; // [1:0.1:30]

// How wide the clip is — the length of cable it grips.
clip_width = 8; // [3:0.5:40]

// Width of the snap-in gap, as a fraction of the cable diameter. Below 1.0 the
// cable has to be pushed past a pinch point, which is what keeps it in.
// scad-web: unit = ratio
gap_ratio = 0.8; // [0.4:0.05:1.2]

/* [Mounting] */
// scad-web: note = The screw that holds it to the wall, and the pad around it.

// Diameter of the screw shank. A #6 wood screw is about 3.5 mm.
screw_hole_diameter = 3.3; // [1.5:0.1:8]

// Diameter of the screw head, which sets how much pad surrounds the hole.
screw_head_diameter = 7; // [3:0.1:16]

// Countersink the hole so a flat head sits flush.
countersink = true;

/* [Walls] */
// scad-web: note = Thickness is set in whole extrusion widths, so the slicer prints solid loops instead of filling a thin gap.

// Extrusion width your slicer is set to. Used to size the wall in whole beads.
extrusion_width = 0.45; // [0.2:0.01:1.2]

// Wall thickness in perimeters. Two is springy, three or four is stiff.
// scad-web: unit = count
perimeters = 2; // [1:1:8]

// Rounding where the loop meets the mounting pad.
fillet = 1.2; // [0:0.1:4]

/* [Quality] */

// Facets per full circle. Higher is smoother, and slower to render.
$fn = 96; // [24:8:180]

/* [Hidden] */

wall = perimeters * extrusion_width;
loop_od = cable_diameter + wall * 2;
gap = cable_diameter * gap_ratio;

// The screw sits far enough out that its head clears the loop, and the pad
// runs a head-radius past it so the hole is fully surrounded.
screw_x = loop_od / 2 + screw_head_diameter / 2 + wall;
pad_length = screw_x + screw_head_diameter / 2;

// Don't let the fillet exceed what the geometry can absorb.
safe_fillet = min(fillet, wall, screw_head_diameter / 4);

// The clip has a constant cross-section, so it's one 2D profile extruded to
// width — far more robust than booleaning solids, and it prints the same.
module profile() {
  round2d(ir = safe_fillet) {
    difference() {
      union() {
        // The loop that captures the cable.
        circle(d = loop_od);
        // Mounting pad, from the loop out to the screw boss.
        // Rounding runs counterclockwise from the +X+Y corner, so this rounds
        // the outer end into a semicircle centered on the screw.
        right(pad_length / 2)
          rect([pad_length, screw_head_diameter],
               rounding = [screw_head_diameter / 2, 0, 0, screw_head_diameter / 2]);
      }
      // Cable channel.
      circle(d = cable_diameter);
      // Snap-in gap at the top.
      back(loop_od / 2)
        rect([gap, loop_od], anchor = CTR);
    }
  }
}

module clip() {
  difference() {
    linear_extrude(height = clip_width, convexity = 6)
      profile();

    // Screw hole, drilled through the pad.
    right(screw_x)
      cyl(d = screw_hole_diameter, l = clip_width + 0.2, anchor = BOT, $fn = max(24, $fn / 2));

    // Countersink for a flat head.
    if (countersink)
      right(screw_x)
        up(clip_width)
          cyl(d1 = screw_hole_diameter, d2 = screw_head_diameter,
              l = (screw_head_diameter - screw_hole_diameter) / 2,
              anchor = TOP, $fn = max(24, $fn / 2));
  }
}

clip();
