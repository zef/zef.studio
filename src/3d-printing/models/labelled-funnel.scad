// Labelled Funnel
//
// A funnel whose throat is a smooth curve rather than a hard cone-to-tube
// corner, so powders and grains keep moving instead of packing at the step.
// The rim carries an embossed label — put whatever the funnel is dedicated to
// on it, and print one per material.
//
// Print rim-down on the flat lip. No supports.
//
// scad-web: libraries = BOSL2
// scad-web: fonts = true

include <BOSL2/std.scad>

/* [Funnel] */

// Diameter across the top of the cone, not counting the rim.
mouth_diameter = 40; // [15:0.5:150]

// Height of the cone section.
cone_height = 20; // [8:0.5:120]

// How much the throat curves between cone and spout. 0 is a straight cone,
// 1 is a deep bell.
throat_curve = 0.5; // [0:0.05:1]

/* [Spout] */

// Outside diameter at the tip of the spout — size this to the bottle neck.
spout_diameter = 8.5; // [3:0.1:40]

// Outside diameter where the spout meets the throat. Larger than the tip
// gives a taper that seats into a bottle.
spout_top_diameter = 9.5; // [3:0.1:40]

// Length of the spout.
spout_length = 13; // [4:0.5:60]

/* [Rim] */

// How far the rim extends out past the mouth. Also the flat the funnel prints on.
rim_width = 6; // [0:0.5:20]

// Text embossed around the rim. Leave empty for no label.
label = "FLOUR";

// Lettering style. Bold holds up better at small sizes once printed.
label_style = "Bold"; // [Regular, Bold, Mono, Mono Bold]

// Label height as a fraction of the rim width.
label_scale = 0.7; // [0.3:0.05:1]

// How deep the lettering is cut into the rim.
label_depth = 0.6; // [0.2:0.05:2]

/* [Wall] */

// Wall thickness throughout.
wall = 2.2; // [0.8:0.1:6]

/* [Quality] */

// Facets per full circle. Higher is smoother, and slower to render.
$fn = 72; // [24:8:140]

/* [Hidden] */

mouth_radius = mouth_diameter / 2;
spout_top_radius = spout_top_diameter / 2;
spout_radius = spout_diameter / 2;
total_height = cone_height + spout_length;

// Dropdown values stay plain so they read well in the customizer; the actual
// fontconfig pattern is assembled here.
label_font = label_style == "Bold" ? "DejaVu Sans:style=Bold"
           : label_style == "Mono" ? "DejaVu Sans Mono"
           : label_style == "Mono Bold" ? "DejaVu Sans Mono:style=Bold"
           : "DejaVu Sans";

echo(str("Overall height: ", total_height + wall, " mm"));
echo(str("Rim diameter: ", mouth_diameter + rim_width * 2, " mm"));

// The wall is drawn as a path and swept around, so the cone-to-spout
// transition is a rounded corner rather than a crease.
funnel_points = [
  [mouth_radius, 0],
  [spout_top_radius, cone_height],
  [spout_radius, total_height],
];

module wall_profile() {
  path = smooth_path(funnel_points, relsize = throat_curve, method = "corners", splinesteps = 16);
  stroke(path, width = wall);
}

module rim() {
  // Built separately from the swept wall so the underside stays a true flat
  // for the build plate instead of picking up the sweep's roundover.
  tube(h = wall, or = mouth_radius + rim_width, wall = rim_width, orounding = wall / 2);
}

module label_cut() {
  size = rim_width * label_scale;
  radius = mouth_radius + rim_width * 0.1;
  path = path3d(arc(96, r = radius, angle = [0, 360]));

  path_text(path, label,
            size = size,
            offset = wall / 2,
            thickness = label_depth * 2,
            center = true,
            textmetrics = true,
            font = label_font,
            normal = DOWN);
}

module funnel() {
  up(wall / 2)
    diff() {
      rotate_extrude(convexity = 10) wall_profile();
      rim();
      if (label != "")
        tag("remove") label_cut();
    }
}

funnel();
