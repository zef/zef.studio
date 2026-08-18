// Tile Spacer
//
// Reusable spacers for setting consistent grout lines. Four arms sit in a
// cross at an interior joint, three make a tee against a wall, two work along
// a straight run. The ball on each arm tip is what actually contacts the tile,
// so the spacer pulls back out cleanly once the mortar sets.
//
// Print in PETG or PLA. No supports.
//
// scad-web: libraries = BOSL2

include <BOSL2/std.scad>

/* [Grout Line] */

// Thickness of the grout line this spacer sets. 3/16" is 4.76 mm, 1/8" is 3.18 mm.
spacing = 4.76; // [1:0.02:12]

// How far each arm reaches from the center. Longer arms are easier to grab.
arm_length = 11.5; // [5:0.5:30]

// Four arms for an interior cross joint, three for a tee, two for a straight run.
arms = 4; // [2:1:6]

/* [Detail] */

// Chamfer along the arms so the spacer slides into a joint without catching.
chamfer = 0.5; // [0:0.05:1.5]

// Print a row of spacers at once. Handy — you always want more than one.
copies = 1; // [1:1:12]

/* [Quality] */

// Facets per full circle. Higher is smoother, and slower to render.
$fn = 72; // [24:8:160]

/* [Hidden] */

// Keep the chamfer from eating the whole arm at small grout widths.
safe_chamfer = min(chamfer, spacing / 2 - 0.1);

module tile_spacer(arm_length = arm_length, arms = arms) {
  zrot_copies(n = arms) {
    cuboid([spacing, arm_length, spacing], chamfer = safe_chamfer, edges = "Y", anchor = FRONT);
    ymove(arm_length)
      cyl(d = spacing, h = spacing, chamfer = safe_chamfer);
  }
}

xcopies(n = copies, spacing = arm_length * 2.4)
  tile_spacer();
