---
date: 2022-05-13 12:00
description: Printing a watch band retainer with flexible filament
tags: 3d Printing, 3d Modeling, Repair
image: watch-band-squish.jpg
---

# 3D Printed Watch Band Retainer

This tiny project was my first print with a flexible filament (TPU) to fix my
son's $4 thrift store watch.

Being somewhat trivial, I'm not quite sure why I made a video and post out of
this. I have some more interesting projects in mind and I guess I'm just
starting small. I'm hoping that the things I share inspire people to fix things
on their own, and exposes a bit of the process of designing and printing parts.

<div class="video-container"><iframe src="https://www.youtube.com/embed/skQ_bd8g01c" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>

After [modeling the part](https://gist.github.com/zef/020ab703abe8aa96bfbdda32daeb7906) in
[OpenSCAD](https://www.openscad.org), I realized that the
[BOSL library](https://github.com/revarbat/BOSL2/wiki) includes
[a `rect_tube` function](https://github.com/revarbat/BOSL2/wiki/shapes3d.scad#module-rect_tube)
that can do this in one line of code, but I also noticed that it renders a lot
more slowly than my simple implementation.

I used [Overture TPU Filament](https://amzn.to/39kgqAC) and it printed very
nicely on my Prusa Mini. I made sure to set a fairly low print speed, as TPU
does not print well when the movement is too fast. I also used a glue stick on
the build plate to prevent it from adhering too strongly.

