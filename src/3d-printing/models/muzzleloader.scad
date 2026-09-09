// Muzzleloader field-charge kit. Set `part` and render.
//
//   "powder"  screw-top tube holding one measured charge. The neck tapers into
//             the muzzle to funnel powder; the tube OD catches on the crown so
//             it can't follow the charge down. Its cap carries a 209 primer.
//   "bullet"  same tube sized around a bullet, full-width neck, larger cap.
//   "band"    figure-8 TPU sleeve strapping a bullet to the powder tube.
//
// https://github.com/revarbat/BOSL2/wiki
// Install: https://github.com/revarbat/BOSL2/wiki#installation
include <BOSL2/std.scad>
include <BOSL2/bottlecaps.scad>

$fn = 140;

part = "powder"; // "powder", "bullet" or "band"

// ------------------------------------------------------------------ the charge
// Volumetric grains, the muzzleloading convention: the volume that N grains by
// weight of reference black powder occupies. Pyrodex and Triple Seven are less
// dense, so the same volume weighs less on a scale. Charges are volumetric.
target_grains = 100;

// mm^3 per volumetric grain. No standards body; published values spread ~+/-8%:
//   62.8  Lee VMD, black FFFFg         68.0  Lee dipper chart, BLACK FFG
//   64.8  "black powder ~1.0 g/cm^3"   71.9  Lee VMD, black FFg
//   66.1  10 gr per 1/4" of a 29/64" hole (0.403 in^3 per 100 gr), matches GOEX
// Finer granulations pack denser: FFFg wants a smaller number than FFg.
// To calibrate, pour in a charge from a measure you trust and scale by
// (height it filled to) / (height of the taper top).
grain_volume = 66.05; // mm^3

target_volume = target_grains * grain_volume; // mm^3

// ------------------------------------------------------------------- the tubes
wall_thickness = 0.9; // every wall, floor and band in the model

caliber = 0.50; // inches
bore_d = caliber * INCH;

bullet_fit = 0.5; // diametral, added to the bore
bullet_length = 33;

tube_id = bore_d + bullet_fit;
tube_od = tube_id + wall_thickness * 2;

transition_length = 5; // the taper that sits in the muzzle while you pour

powder_neck_od = 11.5; // narrow enough for the barrel to swallow
bullet_neck_od = tube_od;
thread_depth = 0.8;
thread_pitch = 2;
thread_height = 8.5;

// ----------------------------------------------------------- the primer pocket
// Bored through the cap's outer face into a boss hanging down the neck bore, so
// the primer loads from outside and sits flush. The cap prints face-down and the
// pocket shows up as a hole in the bed-side surface.
primer_pocket = true;

primer_d = 6.147; // 209 primer body, measured .242"
primer_depth = 7.5; // from the outer face; a longer primer stands proud to grab

// Diametral clearance -- the number to fiddle with. Raise ~0.05 at a time for
// less grip. TPU wants more than PLA: it prints holes undersized, then the walls
// squeeze whatever is in them.
primer_fit = 0.12;

primer_bore_d = primer_d + primer_fit;
primer_boss_od = primer_bore_d + wall_thickness * 2;

// ------------------------------------------------------------------- the band
band_height = 8;
band_grip = 0.4; // diametral interference; the stretch is what holds the bullet

// ------------------------------------------------------------------ soundness
powder_thread_od = powder_neck_od + thread_depth;
bullet_thread_od = bullet_neck_od + thread_depth;
powder_neck_id = powder_neck_od - wall_thickness * 2;
primer_headroom = thread_height + 0.1; // inside-top of the cap to the powder

assert(powder_thread_od < bore_d,
       str("powder neck ", powder_thread_od, "mm will not enter a ", caliber,
           " bore (", bore_d, "mm) -- reduce powder_neck_od or thread_depth"));
assert(tube_od > bore_d,
       str("tube ", tube_od, "mm is not fat enough to catch on a ", caliber,
           " muzzle (", bore_d, "mm) and would drop in -- thicken wall_thickness"));
assert(!primer_pocket || primer_boss_od < powder_neck_id,
       str("primer boss ", primer_boss_od, "mm will not clear the neck bore (",
           powder_neck_id, "mm) -- reduce primer_fit"));
assert(!primer_pocket || primer_depth < primer_headroom,
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

echo("target volume (mm^3)", target_volume);
echo("powder tube, caps off (mm)",
     thread_height + transition_length + powder_length + wall_thickness);
echo("bullet tube, caps off (mm)",
     thread_height + bullet_body_length + wall_thickness);
echo("headspace over powder (grains)", neck_headspace / grain_volume);

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
  zmove(wall_thickness+.1)
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

// The transition and the main tube share an outside *and* an inside diameter
// where they meet, so butting them leaves two identical annular faces inside
// the solid and the union has nothing to cut against -- 140 edges come out
// used six times over. BOSL2 defaults $overlap to 0, so say it here: sinking
// the joint by a hundredth of a millimetre gives the union something to
// resolve and the tube exports watertight.
seam_overlap = 0.01;

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

// --------------------------------------------------------------------- preview
if (part == "powder") {
  right(tube_od*1.5) zflip() powder_cap();
  powder_tube();
} else if (part == "bullet") {
  up(thread_height) bullet_cap();
  bullet_tube();
} else if (part == "band") {
  bullet_band();
} else {
  assert(false, str("unknown part \"", part, "\" -- use powder, bullet or band"));
}
