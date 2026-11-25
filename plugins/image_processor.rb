require "image_processing/vips"
require "ruby-vips"

# Represents a resized/usable image that can be used by the site
class SiteImage
  attr_reader :disk_path, :site_path

  def initialize(disk_path, site_path)
    @disk_path = disk_path
    @site_path = site_path
    @width = nil
    @height = nil
    @dimensions_loaded = false
  end

  def width
    load_dimensions unless @dimensions_loaded
    @width
  end

  def height
    load_dimensions unless @dimensions_loaded
    @height
  end

  private

  def load_dimensions
    @dimensions_loaded = true
    begin
      img = Vips::Image.new_from_file(@disk_path)
      @width = img.width
      @height = img.height
    rescue => e
      Bridgetown.logger.error "SiteImage:", "Failed to read image dimensions for #{@disk_path}: #{e}"
      @width = nil
      @height = nil
    end
  end
end

# Represents a source image that will be processed.
# can be initialized from absolute path or a path relative to the resource
# and its existence on disk will be verified
class SourceImage
  SIZES = { small: 1248, large: 3000 }

  def initialize(source_path, site)
    @source_path = source_path
    @site = site
  end

  def self.from_src(src, resource, site)
    unless src.start_with?("/")
      src = File.join("_posts", resource.relative_url, src)
    end

    disk_path = site.in_source_dir(src)

    if !File.exist?(disk_path)
      jpeg = disk_path.sub(/jpg$/, "jpeg")
      disk_path = jpeg if File.exist?(jpeg)
    end

    image = new(disk_path, site)
    # Originals of resized photos aren't kept in the repo (.gitignore), so a
    # fresh clone has only the resized copies, and those are all it needs.
    return image if File.exist?(disk_path) || image.resized_copies?

    Bridgetown.logger.error "SourceImage:", "Source image not found: #{disk_path}"
    nil
  end

  def small
    resized(SIZES[:small])
  end

  # Whether every size has already been made, so the original isn't needed.
  def resized_copies?
    resizable?(destination_for(SIZES[:small])) && SIZES.values.all? { |width| File.exist?(destination_for(width)) }
  end

  def large
    resized(SIZES[:large])
  end

  private

  def resizable?(path)
    File.extname(path).casecmp(".jpg").zero?
  end

  # Where a variant belongs on disk. An image under _posts is served from the
  # path its post is served from, so its variants sit outside _posts, mirroring
  # the rest of the path. Anything else keeps the place it already has.
  def destination_for(width)
    posts_dir = File.join(@site.source, "_posts", "")
    path = @source_path.start_with?(posts_dir) ? @source_path.sub(posts_dir, File.join(@site.source, "")) : @source_path.dup
    path = path.sub(/\.jpeg\z/i, ".jpg")
    return path unless resizable?(path)

    path.sub(/(\.\w+)\z/, "-#{width}\\1")
  end

  # A file's URL is just where it sits under the source directory. Deriving it
  # relative to anything else meant patching the result afterwards, which is
  # how every image on the site came to be served from a path containing "/..".
  def site_path_for(disk_path)
    "/#{Pathname.new(disk_path).relative_path_from(Pathname.new(@site.source))}"
  end

  def resized(width)
    destination = destination_for(width)
    site_path = site_path_for(destination)

    # Made before: the original may not even be here (see from_src).
    return SiteImage.new(destination, site_path) if resizable?(destination) && File.exist?(destination)

    unless File.exist?(@source_path)
      Bridgetown.logger.error "SourceImage:", "Original source not found for #{@source_path}; skipping resize"
      return nil
    end

    # Formats we don't resize are served as they are.
    return SiteImage.new(@source_path, site_path) unless resizable?(destination)

    unless File.exist?(destination)
      Bridgetown.logger.info "ImageProcessor:", "Resizing #{File.basename(@source_path)} to #{width}px"
      FileUtils.mkdir_p(File.dirname(destination))
      # Keep only the colour profile: camera metadata, GPS location among it,
      # otherwise rides along into every published copy.
      ImageProcessing::Vips.source(@source_path).saver(keep: "icc").resize_to_limit(width, width).call(destination: destination)
    end

    SiteImage.new(destination, site_path)
  end
end

class ImageProcessor < SiteBuilder
    def build
        Bridgetown.logger.info " ImageProcessor:", "Resizing images and reformatting image tags."
        hook :resources, :pre_render do |resource|
            # Resize the image named in front matter, which isn't always one of
            # the images in the body, and rewrite "image" to the resized path so
            # the feed and the index cards get a usable URL.
            #
            # That rewrite makes this hook destructive to its own input, so the
            # original is kept alongside it. Without that, any rebuild that
            # re-renders a resource without re-reading its front matter — saving
            # a layout while the dev server is running does it — would find the
            # derived path sitting in "image", resize *that*, and leave a
            # duplicate named foo-1248-1248.jpg behind. Reading from the
            # original means the hook lands on the same answer however many
            # times it runs.
            source = resource.data["image_source"] ||= resource.data["image"]
            next unless source

            image = SourceImage.from_src(source, resource, site)
            next unless image

            small_img = image.small
            next unless small_img

            resource.data["image"] = small_img.site_path
        end

        hook :resources, :post_render do |resource|
            # puts resource.path
            next unless resource.data.layout == "page" || resource.data.layout == "post"
            next unless resource.output_ext == ".html"
            next unless resource.content

            # Process images and wrap in figure tags
            resource.output = process_post_images(resource.output, resource)
            
            # Count images after processing
            image_count = resource.output.scan(/<figure[^>]*>.*?<\/figure>/m).length
            resource.data["image_count"] = image_count if image_count > 0
        end
    end

    private

    def process_post_images(content, resource)
        content.gsub(/<img\s+([^>]*?)>/) do |match|
            attributes = parse_img_attributes($1, resource)
            
            # Skip if already in a figure
            # next match if content[0...content.index(match)].rindex("<figure") &&
            #               content[0...content.index(match)].rindex("<figure") >
            #                 (content[0...content.index(match)].rindex("</figure") || -1)

            src = attributes[:src]
            image = SourceImage.from_src(src, resource, site)
            next match unless image

            small_img = image.small
            large_img = image.large
            next match unless small_img && large_img

            build_figure(attributes, large_img.site_path, small_img.site_path, large_img.width, large_img.height)
        end
    end

    def parse_img_attributes(attr_string, resource)
        attrs = {}
        
        if attr_string =~ /src=(["'])(.*?)\1/
            attrs[:src] = $2
        end
        
        if attr_string =~ /alt=(["'])(.*?)\1/
            attrs[:alt] = $2
        end
        
        # Parse title attribute to use as caption
        if attr_string =~ /title=(["'])(.*?)\1/
            title_text = $2
            if title_text == "&amp;"
                attrs[:caption] = attrs[:alt]
            else
                attrs[:caption] = title_text
            end
        end
        
        if attr_string =~ /class=(["'])(.*?)\1/
            attrs[:class] = $2
        end

        attrs
    end

    def build_figure(attributes, large_src, small_src, width, height)
        # Render using ERB template
        template = ERB.new(<<~ERB.strip, trim_mode: "-")
        <figure<%= attributes[:class] ? %( class="\#{attributes[:class]}") : "" %>>
            <a href="<%= large_src %>" data-pswp-width="<%= width %>" data-pswp-height="<%= height %>">
            <img src="<%= small_src %>" alt="<%= attributes[:alt] || "" %>">
            </a>
            <%- if attributes[:caption] -%>
            <figcaption><%= attributes[:caption] %></figcaption>
            <%- end -%>
        </figure>
        ERB
        
        template.result(binding)
    end

end
