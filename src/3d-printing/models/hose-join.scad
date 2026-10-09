// Hose Joiner
//
// A barbed splice for pushing two lengths of flexible tubing together. The
// stacked ribs let the hose slide on but bite when it tries to pull back off,
// and each end is sized independently, so this doubles as a reducer between
// two different hose sizes.
//
// Print upright with no supports. PETG holds up better than PLA against heat
// and sunlight if the joint lives outdoors.
//
// scad-web: libraries = BOSL2

include <BOSL2/std.scad>

/* [Ends] */
// scad-web: note = Size each barb to the inner bore of the hose it goes into. Different sizes make a reducer.

// Outside diameter of the barb on the first end — measure the hose's inner bore.
end_a_diameter = 14.5; // [4:0.1:60]

// Outside diameter of the barb on the second end. Set it differently to make a reducer.
end_b_diameter = 14.5; // [4:0.1:60]

// How far each barb reaches into its hose.
insert_length = 22; // [8:0.5:60]

/* [Barbs] */
// scad-web: note = The ribs that let the hose slide on but bite when it pulls back.

// Number of gripping ribs on each end.
// scad-web: unit = count
rib_count = 8; // [0:1:20]

// How far each rib stands out past the barb. More grip, harder to push on.
// scad-web: unit = mm
rib_thickness = 0.4; // [0.1:0.05:1.5]

// Thickness of each rib along the length of the barb.
// scad-web: unit = mm
rib_height = 0.8; // [0.4:0.05:3]

/* [Wall] */
// scad-web: note = The bore through the middle is the barb diameter less twice this.

// Wall thickness. The bore through the middle is the barb diameter less twice this.
// scad-web: unit = mm
wall = 1.4; // [0.6:0.05:5]

/* [Quality] */

// Facets per full circle. Higher is smoother, and slower to render.
$fn = 64; // [24:8:160]

/* [Hidden] */

// A collar in the middle stops the hose at the right depth from either side.
collar_height = 2.4;
collar_extra = 1.6;

// Keep the bore from closing up if the wall is set thicker than the barb allows.
function bore(od) = max(1, od - wall * 2);

module barb(od) {
  difference() {
    union() {
      cyl(d = od, l = insert_length, chamfer2 = min(1.2, od / 4), anchor = BOT);
      // Ribs spread evenly along the barb, from just above the collar to just
      // short of the tip, so the spacing follows the insert length rather than
      // running off the end when there are a lot of them.
      if (rib_count > 0)
        for (i = [0 : rib_count - 1])
          up(insert_length * (rib_count > 1 ? 0.15 + 0.68 * i / (rib_count - 1) : 0.5))
            cyl(d = od + rib_thickness * 2, l = rib_height, chamfer = rib_height / 2, anchor = BOT);
    }
    // Through bore, opened slightly past each face so the ends cut clean.
    cyl(d = bore(od), l = insert_length + 0.02, anchor = BOT);
  }
}

module joiner() {
  collar_d = max(end_a_diameter, end_b_diameter) + collar_extra;

  // Collar at the seam, with the bore stepping between the two sizes.
  difference() {
    cyl(d = collar_d, l = collar_height, chamfer = 0.4, anchor = CTR);
    cyl(d1 = bore(end_a_diameter), d2 = bore(end_b_diameter), l = collar_height + 0.02, anchor = CTR);
  }

  up(collar_height / 2) barb(end_a_diameter);
  down(collar_height / 2) zflip() barb(end_b_diameter);
}

joiner();
