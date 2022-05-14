---
date: 2022-05-13 12:00
description: Printing a watch band retainer with flexible filament
tags: 3d Printing, 3d Modeling, Repair
image: watch-band-squish.jpg
---

# 3D Printed Watch Band Retainer

This was a tiny project and my first test print with a flexible filament to fix my
son's $4 thrift store watch.

I'm not quite sure why I made a video and post of this. I have some other more
interesting projects in mind and I guess I'm just starting small, and hoping it
helps someone be inspired to fix things on their own.

<div class="video-container"><iframe src="https://www.youtube.com/embed/skQ_bd8g01c" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>

After [modeling the
part](https://gist.github.com/zef/020ab703abe8aa96bfbdda32daeb7906) manually in
[OpenSCAD](https://www.openscad.org), I realized that the
[BOSL library](https://github.com/revarbat/BOSL2/wiki) includes a
[`rect_tube` function](https://github.com/revarbat/BOSL2/wiki/shapes3d.scad#module-rect_tube)
that can do this in one line of code, but I also noticed that it renders a lot
more slowly than doing it manually like I did.

I used [Overture TPU Filament](https://amzn.to/39kgqAC) and it printed very
nicely on my Prusa Mini. I made sure to set a fairly low print speed, as TPU
does not print well when the movement is too fast.

