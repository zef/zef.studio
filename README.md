# zef.studio

This is the code and content that generates my personal website at
[zef.studio](https://zef.studio).

The website is written in [Swift](https://swift.org) and generated as a static
site using [Publish by John Sundell](https://github.com/JohnSundell/Publish),
with a whole lot of customization that I did to get things how I want them.

I haven't put any time into documenting these, but let me know if you have any
questions!

The template and design is handcoded by me, and I use the excellent
[Sass](https://sass-lang.com) to generate the CSS.

I also used [PhotoSwipe](https://photoswipe.com) for the image gallery that is
activated when an image is selected.


# Bridgetown Migration

[ ] Metadata like Twitter cards


## Customizations

### Image Handling

Laying out images nicely is very important to me. I use lists to set images in
groups how many I want. They can be displayed in 2-3 columns. I use a `^` as an
[End-Of-Block marker](https://kramdown.gettalong.org/syntax.html#eob-marker)
in kramdown to separate lists when I want control over the layout.

### Front Matter Options

- `title` is not needed in Front Matter if it's provided as an initial header, I infer and set it by the first header in markdown files.
- `short_title` used for the post preview on the index pages.
- `postscript` displays a small centered note at the bottom of the post.
- `excerpt` overrides the automatically generated excerpt. Only used on index pages where there is no key image.
- `image` can be defined as simply a filename that exists in the same directory as the post. The absolute URL is inferred from this.