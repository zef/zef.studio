// Muzzleloader Field Charge Kit
//
// A pre-measured charge you can load one-handed in the cold. The powder tube
// holds one volumetric charge and screws shut; its neck tapers into the muzzle
// so the powder funnels straight down the bore, while the tube's shoulder
// catches on the crown so the tube can't follow the charge in. The cap carries
// a 209 primer in a pocket bored from the outside, so the whole charge —
// powder and ignition — is one object in your pocket. A second tube sized
// around a bullet, and a TPU band that straps a bullet to the powder tube,
// make up the rest of the kit.
//
// Print the tubes and caps in PLA or PETG, the band in TPU. No supports: the
// caps print face-down so the primer pocket appears as a hole in the bed-side
// surface, and the tubes print standing on their closed ends.
//
// scad-web: parts = part
// scad-web: libraries = BOSL2

include <BOSL2/std.scad>
include <BOSL2/bottlecaps.scad>

/* [Part] */

// Each piece prints on its own. Tick the ones you want and each is rendered
// and named separately; in desktop OpenSCAD this is an ordinary dropdown, so
// render one at a time there.
part = "powder_tube"; // [powder_tube:Powder Tube, powder_cap:Powder Cap, bullet_tube:Bullet Tube, bullet_cap:Bullet Cap, bullet_band:Bullet Band]

/* [The Charge] */
// scad-web: note = Volumetric grains, the muzzleloading convention: the volume that N grains by weight of reference black powder occupies. Pyrodex and Triple Seven are less dense, so the same volume weighs less on a scale.

// The charge this tube is cut to hold. Sets the length of the powder tube and
// nothing else.
// scad-web: unit = count
target_grains = 100; // [25:5:200]

// Cubic millimetres per volumetric grain. There is no standards body here and
// published values spread about ±8%:
//   62.8  Lee VMD, black FFFFg         68.0  Lee dipper chart, BLACK FFG
//   64.8  "black powder ~1.0 g/cm^3"   71.9  Lee VMD, black FFg
//   66.1  10 gr per 1/4" of a 29/64" hole, which matches GOEX
// Finer granulations pack denser, so FFFg wants a smaller number than FFg. To
// calibrate, pour in a charge from a measure you trust and scale by (the
// height it filled to) / (the height of the taper top).
// scad-web: unit = none
grain_volume = 66.05; // [55:0.05:80]

/* [Bore and Bullet] */
// scad-web: note = What the kit has to fit. Caliber drives the tube diameter, which is what stops the tube dropping into the barrel.

// Bore diameter, in inches — the one measurement in this model that isn't
// millimetres, because that is how a rifle is described.
// scad-web: unit = inch
caliber = 0.50; // [0.30:0.01:0.62]

// Clearance around the bullet, added to the bore diameter. Also sets how
// loosely the tubes sit in the muzzle.
bullet_fit = 0.5; // [0:0.05:2]

// Overall length of the bullet the bullet tube has to swallow.
bullet_length = 33; // [10:0.5:70]

/* [Tubes] */
// scad-web: note = Both tubes and both caps share these. The walls are deliberately thin — these carry a charge in a pocket, not a load.

// Every wall, floor and band in the model.
wall_thickness = 0.9; // [0.4:0.1:3]

// The taper that sits in the muzzle while you pour. Its cavity counts toward
// the charge, so powder fills to the top of it.
transition_length = 5; // [0:0.5:15]

// Outside diameter of the powder tube's neck. Narrow enough that the barrel
// swallows it — the model refuses to build if it isn't.
powder_neck_od = 11.5; // [6:0.1:20]

// How far the thread stands out from the neck.
thread_depth = 0.8; // [0.4:0.05:2]

// Distance between thread crests. Coarser threads close in fewer turns and
// print more cleanly.
thread_pitch = 2; // [1:0.25:4]

// Length of the threaded section, which is also the depth of the cap.
thread_height = 8.5; // [4:0.5:20]

/* [Primer Pocket] */
// scad-web: note = Bored through the cap's outer face into a boss hanging down the neck bore, so the primer loads from outside and sits flush.

// Whether the powder cap carries a primer at all. Off gives a plain cap.
primer_pocket = true;

// Primer body diameter. A 209 shotshell primer measures .242".
primer_d = 6.147; // [4:0.001:9]

// Pocket depth from the outer face. A longer primer standing slightly proud
// is easier to grab with cold fingers.
primer_depth = 7.5; // [3:0.1:12]

// Diametral clearance — the number to fiddle with. Raise it about 0.05 at a
// time for less grip. TPU wants more than PLA: it prints holes undersized and
// then the walls squeeze whatever is in them.
primer_fit = 0.12; // [0:0.01:0.5]

/* [Band] */
// scad-web: note = A figure-8 TPU sleeve that straps a bullet alongside the powder tube, so one grab gets you the whole reload.

// How tall the band is.
band_height = 8; // [3:0.5:20]

// Diametral interference. The stretch is what holds the bullet, so this wants
// to be a squeeze, not a fit.
band_grip = 0.4; // [0:0.05:1.5]

/* [Detail] */
// scad-web: note = How finely curves are approximated. Lower is faster to render and to slice; the printed difference stops being visible somewhere below what is set here.

$fn = 140; // [40:10:220]

/* [Hidden] */

bore_d = caliber * INCH;
target_volume = target_grains * grain_volume; // mm^3

tube_id = bore_d + bullet_fit;
tube_od = tube_id + wall_thickness * 2;

bullet_neck_od = tube_od;
primer_bore_d = primer_d + primer_fit;
primer_boss_od = primer_bore_d + wall_thickness * 2;

// The cap is modelled where it sits screwed down, a hair clear of the neck top
// so the two don't share a face in the assembled view.
cap_clearance = 0.1;

// The transition and the main tube share an outside *and* an inside diameter
// where they meet, so butting them leaves two identical annular faces inside
// the solid and the union has nothing to cut against -- 140 edges come out
// used six times over. BOSL2 defaults $overlap to 0, so say it here: sinking
// the joint by a hundredth of a millimetre gives the union something to
// resolve and the tube exports watertight.
seam_overlap = 0.01;

// ------------------------------------------------------------------ soundness
powder_thread_od = powder_neck_od + thread_depth;
bullet_thread_od = bullet_neck_od + thread_depth;
powder_neck_id = powder_neck_od - wall_thickness * 2;
primer_headroom = thread_height + 0.1; // inside-top of the cap to the powder

// Each rule below stops only the parts it is actually about. Flat assertions
// checked the whole design on every render, so shortening the thread refused
// to build the powder *tube* over a rule about the primer pocket in the cap --
// a part that wasn't being rendered and needn't have been in the kit at all.
checking_powder_tube = part == "powder_tube";
checking_primer_cap = part == "powder_cap" && primer_pocket;

assert(!checking_powder_tube || powder_thread_od < bore_d,
       str("powder neck ", powder_thread_od, "mm will not enter a ", caliber,
           " bore (", bore_d, "mm) -- reduce powder_neck_od or thread_depth"));
assert(!checking_powder_tube || tube_od > bore_d,
       str("tube ", tube_od, "mm is not fat enough to catch on a ", caliber,
           " muzzle (", bore_d, "mm) and would drop in -- thicken wall_thickness"));
assert(!checking_primer_cap || primer_boss_od < powder_neck_id,
       str("primer boss ", primer_boss_od, "mm will not clear the neck bore (",
           powder_neck_id, "mm) -- reduce primer_fit"));
assert(!checking_primer_cap || primer_depth < primer_headroom,
       str("primer boss ", primer_depth, "mm reaches past the neck (",
           primer_headroom, "mm) into the powder -- shorten primer_depth"));

// -------------------------------------------------------------------- reports
// Volume of a conical frustum, from its height and end diameters.
function frustum_volume(h, d1, d2) = PI * h * (d1^2 + d1*d2 + d2^2) / 12;

// The taper's cavity counts toward the charge, so powder fills to its top.
transition_volume = frustum_volume(transition_length, tube_id, powder_neck_id);
powder_length = (target_volume - transition_volume) / PI / (tube_id/2)^2;

// The neck bore is usable bullet space, so the chamber only needs the rest.
bullet_body_length = bullet_length + bullet_fit - thread_height;

// Air left over the powder once the cap is on, less whatever the boss occupies.
neck_headspace = PI * (powder_neck_id/2)^2 * thread_height
               - (primer_pocket ? PI * (primer_boss_od/2)^2 * (primer_depth - 0.1) : 0);

// "Label: value" is the shape the website reads these back in, and rounding
// keeps them to a precision anyone could measure.
function reported(value, places = 2) = round(value * pow(10, places)) / pow(10, places);

echo(str("Charge volume: ", reported(target_volume, 0), " mm3"));
echo(str("Powder tube, cap off: ", reported(
     thread_height + transition_length + powder_length + wall_thickness, 1), " mm"));
echo(str("Bullet tube, cap off: ", reported(
     thread_height + bullet_body_length + wall_thickness, 1), " mm"));
echo(str("Headspace over powder: ", reported(neck_headspace / grain_volume, 1), " grains"));

// -------------------------------------------------------------------- modules
module screw_neck(neck, thread, id) {
  generic_bottle_neck(
      neck_d=neck,
      id=id,
      thread_od=thread,
      support_d=0,
      pitch=thread_pitch,
      height=thread_height,
      round_supp=false
  ) children();
}

// Positioned as it sits screwed down, with the neck top at the origin.
module screw_cap(neck, thread, primer=false) {
  zmove(wall_thickness + cap_clearance)
    diff()
    generic_bottle_cap(
        texture="ribbed",
        wall=wall_thickness,
        neck_od=neck,
        thread_od=thread,
        height=thread_height,
        pitch=thread_pitch,
        tolerance=0.2,
        flank_angle=30,
        orient=DOWN,
        spin=300
    ) {
      // Child +Z runs into the cap, so "down" here is out through its face. The
      // bore starts at that face and stops a wall short of the boss end, so an
      // empty pocket still can't leak powder.
      if (primer) attach("inside-top") {
        cyl(d=primer_boss_od, h=primer_depth, anchor=BOT,
            chamfer2=wall_thickness/3);
        tag("remove") down(wall_thickness)
          cyl(d=primer_bore_d, h=primer_depth, anchor=BOT,
              chamfer1=-wall_thickness/3);
      }
    }
}

module powder_cap() { screw_cap(powder_neck_od, powder_thread_od, primer=primer_pocket); }
module bullet_cap() { screw_cap(bullet_neck_od, bullet_thread_od); }

module powder_tube() {
  // threaded neck
  screw_neck(powder_neck_od, powder_thread_od, powder_neck_id)
  // transition to main tube
  attach(BOT, TOP) tube(h=transition_length, id1=tube_id, id2=powder_neck_id, wall=wall_thickness)
  // main tube
  attach(BOT, TOP, overlap=seam_overlap) tube(od=tube_od, id=tube_id, l=powder_length)
  // bottom cap
  attach(BOT, TOP) cyl(d=tube_od, l=wall_thickness);
}

module bullet_tube() {
  screw_neck(bullet_neck_od, bullet_thread_od, tube_id)
  attach(BOT, TOP) tube(od=tube_od, id=tube_id, l=bullet_body_length)
  attach(BOT, TOP) cyl(d=tube_od, l=wall_thickness);
}

// Loops sit wall-to-wall and are hulled before boring, so the waist is filled
// rather than pinched to a point.
module bullet_band() {
  tube_loop_id = tube_od - band_grip;
  bullet_loop_id = bore_d - band_grip;
  spacing = (tube_loop_id + bullet_loop_id) / 2 + wall_thickness * 2;

  difference() {
    hull() {
      cyl(d=tube_loop_id + wall_thickness*2, h=band_height,
          rounding=wall_thickness/3);
      right(spacing)
        cyl(d=bullet_loop_id + wall_thickness*2, h=band_height,
            rounding=wall_thickness/3);
    }
    cyl(d=tube_loop_id, h=band_height);
    right(spacing) cyl(d=bullet_loop_id, h=band_height);
  }
}

// ----------------------------------------------------------------- the part
// Each module is built where its geometry is easiest to describe: the tubes
// hang below their neck, and a cap sits the way it does when screwed on. Here
// they are turned the way they print and set down on the plate, so what you
// download is what you slice.
tube_drop = transition_length + powder_length + wall_thickness;
bullet_drop = bullet_body_length + wall_thickness;
cap_rise = wall_thickness + cap_clearance;

if (part == "powder_tube") {
  // Less the overlap, which raised the main tube by that much already.
  up(tube_drop - seam_overlap) powder_tube();
} else if (part == "powder_cap") {
  up(cap_rise) zflip() powder_cap();
} else if (part == "bullet_tube") {
  up(bullet_drop) bullet_tube();
} else if (part == "bullet_cap") {
  up(cap_rise) zflip() bullet_cap();
} else if (part == "bullet_band") {
  up(band_height / 2) bullet_band();
} else {
  assert(false, str("unknown part \"", part, "\" -- see the [Part] dropdown"));
}
