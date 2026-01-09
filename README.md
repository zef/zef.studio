# zef.studio

This is the code and content that generates my personal website at
[zef.studio](https://zef.studio).

The website is generated with [Bridgetown](https://www.bridgetownrb.com)
with some customization that I did to get things how I want them.

It [used to be](https://github.com/zef/zef.studio/tree/8eca7a72b8c0b60fae1f8f83841c2422ef63f03b)
written in [Swift](https://swift.org) and generated as a static site using
[Publish by John Sundell](https://github.com/JohnSundell/Publish).

The template and design is handcoded by me, and I use the excellent
[Sass](https://sass-lang.com) to generate the CSS.

I also used [PhotoSwipe](https://photoswipe.com) for the image gallery that is
activated when an image is selected.

Let me know if you have any questions!

## Customizations

### Image Handling

Laying out images nicely is very important to me. I use lists to set images in
groups how many I want. They can be displayed in 2-3 columns. I use a `^` as an
[End-Of-Block marker](https://kramdown.gettalong.org/syntax.html#eob-marker)
in kramdown to separate lists when I want control over the layout.

### Image Processing

I have a pipeline for resizing images in
[plugins/image_processor.rb](image_processor.rb).  It allows me to refer to
images in posts with just the file name or the absolute path. It creates two
scaled versions of source images, and also wraps image tags in `<figure>` tags
that include a link to a larger sized image that is used for the PhotoSwipe
gallery.

### Front Matter Options

- `title` is not needed in Front Matter if it's provided as an initial header, I infer and set it by the first header in markdown files.
- `short_title` used for the post preview on the index pages.
- `postscript` displays a small centered note at the bottom of the post.
- `excerpt` overrides the automatically generated excerpt. Only used on index pages where there is no key image.
- `image` can be defined as simply a filename that exists in the same directory as the post. The absolute URL is inferred from this.