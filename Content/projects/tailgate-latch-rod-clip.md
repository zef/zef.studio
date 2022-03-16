---
date: 2021-03-16 12:00
postscript: Published on March 16, 2022
description: A 3d printed tailgate latch rod clip that fits my 1995 Toyota T100
tags: 3d Printing, 3d Modeling, Repair
image: broken-clip.jpg
---

# Fixing My Tailgate Latch

The tailgate latch on [my 1995 Toyota T100](https://twitter.com/zefhous/status/1418353547729539075)
truck has been having an annoying problem where one of the rods inside the latch
mechanism keeps getting disconnected and the tailgate can't be opened. When this
happens I have to remove a couple screws and reconnect the rod. It's easy, but
very inconvenient. Sometimes it would stay connected for a while, sometimes it
would come out right away.

- ![Broken tailgate latch rod clip. | The broken red clip.](broken-clip.jpg)
- ![Toyota tailgate latch rod clip. | A closer look at the good clip.](intact-clip.jpg)

As a truck owner, friends and family often borrow my truck. When someone needed
to borrow it recently, I went to clear some snow from the bed and the tailgate
wasn't able to be opened. I decided enough is enough — I wanted to fix it, and
didn't want to try to explain how to get the tailgate open if it happened again.

At this point, I discovered that this part is called a "tailgate latch rod
clip". These are not expensive, but it seems that it can be difficult
to find just the right part and shipping costs and times are an issue
too[1](#footnotes).

Given that I have a 3d printer, I wasn't about to spend money on that and wait
for it to arrive when I can pretty quickly make my own design and work on my
modeling skills. As I seek to become better at understanding clearances for
small parts, there's no better way than to design and build parts whenever I
can. And the more I model things, the faster I get at it.

### The Design

I modeled the part in [OpenSCAD](https://www.openscad.org). You can
[check out the code](https://gist.github.com/zef/627e90036cb3d8f6fa40e9f1fe95a4a3)
and the `.stl` is on my
[Prusa Printers page](https://www.prusaprinters.org/prints/151460-tailgate-latch-rod-clip).

I designed it to be easily 3d printable with no supports, so it isn't shaped
quite like commercially available clips. It cost about $0.03 in plastic and is
printed with PETG. I got a good tight fit on my first print and it seems to be
working quite well one year later, as I'm publishing this post.

I initially started modeling the design after the original part, but it quickly
became apparent that the geometry isn't well suited to 3d printing.

In design, it's easy to focus on existing solutions and to lose sight the actual
problem that needs to be solved. This often leads to difficulties, and a fresh
perspective is often better than trying to force things to work by following the
initial approach too far.

Existing designs are good sources of inspiration, but it's good to question them
when there's a reason to. In this case, the original design is made to be cheap
and well-suited for mass production, but would be hard to 3d print.
Furthermore, you can see its failure mode that got us here in the first place
— that tab that retains the bar breaks off. Since my two existing clips were
different colors, I'm pretty sure that's happened before on this tailgate, and
that the broken part is a replacement part itself. My goal here is simply to
retain that rod in position — creating a solid connection to the center plate
while allowing free rotation when the handle is actuated.

I think the press-in design I ended up with will do that, and as long as the fit
is tight enough to hold the rod in, I think it will actually be a bit tougher
than the original part. Time will tell, and if it does break, then I will have
learned a lesson, and I'll have to use up another few cents of plastic filament.

- ![spinning latch clip | The 3d design](rotating-clip.gif)
- ![3d printed tailgate latch rod clip. | I didn't realize how blurry this shot was before I installed the part. We regret the error.](3d-printed-clip.jpg)
- ![My 3d printed tailgate latch rod clip installed. |&](printed-clip-installed.jpg)

The immediacy for a project like this is really unparalleled with 3d printing.
Despite having to model the part myself because I couldn't find an existing
model, I had it fixed quickly — without having to do any shopping.

As always, the model is parametric, and therefore completely flexible by changing a few
variables, allowing it to accommodate other dimensions too.

## Something I Learned

I gained experience using OpenSCAD. I am competent and comfortable with the
language at this point, but I would like to become faster at using it. I'm not
sure if I would have been able to make this part more quickly with Fusion 360 or
not, but at the moment I feel more likely to go to OpenSCAD as my default
modeling software for simple parts, and only reach for Fusion 360 for designs
that require something more advanced or specific. I may expand on these reasons
in a future post.


1) I also hate the idea of buying a 6-pack and having five left over. You can't
really buy just one. I wouldn't want to throw them out, but I'm not likely to
need more either, so they'll just... sit somewhere and probably never get used?
