---
date: 2020-09-21 12:00
postscript: Published on June 24, 2022
description: Modeling some pegboard mounts for a digital anemometer and infrared temperature gun.
tags: 3d Printing, 3d Modeling
image: mounts-on-board.jpg
---

# Pegboard Mounts for my Anemometer and Infrared Temperature Gun

Here are a couple custom tool holders I made for my shop. I love being able to
have some custom mounts for things like this, and it makes pegboard much more
functional.

![Mounts on pegboard](mounts-on-board.jpg)

I modeled these parts in Fusion 360 using the [peg design
from Make Anything](https://www.youtube.com/watch?v=-eGW-VmvHYE) as a starting
point.

This 40 second video demonstrates the fitment.

<div class="video-container"><iframe src="https://www.youtube.com/embed/dnUPO2UORB0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>

## Digital Anemometer

The design is fully parametric, so it can be easily adjusted for other rectangular objects.
You can
[view the Fusion 360 file online](https://a360.co/3bdo6Dk)
and the STL is
[available on printables](https://www.printables.com/model/58872-anemometer-pegboard-mount).

![Anemometer mount in Fusion 360, showing the parameters. | The Fusion 360 model, showing the parameters.](anemometer-parametric.png)

There are a couple design considerations related to printability.

The pegs need to be printed flat on the bed, so I designed the part to print
upside-down — the pegs flush with the top edge of the holder.

There are ledges on the bottom of the part that hold the device. Since
the mount is printed upside-down, these ledges will be printed as bridges, with
no support material underneath. This is fine with the correct printer settings,
but the bridge distance needs to be limited.

I'm decently happy with it, but from a usability perspective I don't love that the
placement of the pegs is right at the top of the mount, because it isn't as
stable as if the pegs were a bit lower down. Being right at the top, the part
wobbles up a bit as you pull the device out. Maybe this could be improved by
including a lower removable peg insert like I used on the temperature gun, or maybe
some protruding clips or pegs that are designed with printable angles. If I were
doing a larger part or something that I used all the time, I might explore those
options.

This model of anemometer is sold under multiple brands and is available for about
[$16 on Amazon](https://amzn.to/3OfPQIr).

## Infrared Temperature Gun

I wanted a pegboard mount that didn't take up too much space and that looked
nice, which seemed tricky for the temperature gun design, so I came up with this
and am quite pleased with it. All the other designs I've seen are not attractive
to me.

I took a couple photos of the gun, trying to get one directly from the front and
one directly from the side. I brought these into Fusion 360, scaled them based
on measurements with my digital calipers, and made a sketch of the front face.

I found the angle of the gun from the profile view, and extruded the sides out
at that angle.

- ![Straight-on picture of my infrared gun.](head-on.jpg)
- ![Profile picture of my infrared gun.](profile.jpg)
- ![Screenshot from my model in Fusion 360](thermometer-fusion-360.jpg)

You can
[view the Fusion 360 file online](https://a360.co/2OhEdXy),
and the STL is
[available on printables](https://www.printables.com/model/58742-infrared-thermometer-gun-pegboard-mount).

The pegboard attachment mechanism is printed separately and can be glued
together with CA glue.  My first try on that part was not a perfect fit, but I
made some adjustments and re-printed the insert, and didn't glue them together
until I was happy with the fit. I found that printing that insert vertically,
with the pegboard pins coming up made for a stronger attachment to the pegboard,
and I can pull the gun out of the holder without the holder coming off the
pegboard, which I initially couldn't do and had to hold it in as I removed the
thermometer.

My exact model of temp gun is the
[Nubee NUB8550H](https://amzn.to/3OuWlXF),
which doesn't appear to be for sale on Amazon anymore. But seems to be a generic
model that is sold though many manufacturers using the same molds. For instance,
this
[Etekcity Infrared Thermometer](https://amzn.to/3tUneMG)
has an identical shape and plastic markings, like the forward arrows on the
side.

## Printing Details

These parts are printed with
[Prusament Galaxy Black PLA](https://www.prusa3d.com/product/prusament-pla-prusa-galaxy-black-1kg/#_ga=2.206061779.1983805902.1655901445-201699621.1654531136).
I think their Galaxy Black looks really great.
Their "galaxy" colors have glitter specks in them, which helps hide the layer
lines in the 3d prints and gives them a nicer look. I generally prefer PETG these days,
but this was a roll of PLA I bought with my printer.

