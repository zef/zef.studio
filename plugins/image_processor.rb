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
      disk_path = disk_path.sub(/jpg$/, "jpeg")
      if !File.exist?(disk_path)
        Bridgetown.logger.error "SourceImage:", "Source image not found: #{disk_path}"
        return nil
      end
    end

    new(disk_path, site)
  end

  def small
    resized(SIZES[:small])
  end

  def large
    resized(SIZES[:large])
  end

  private

  def resized(width)
    destination = @source_path.sub("src/_posts/", "src/")
                                .sub(/jpeg$/, "jpg")
                                .sub(/(\.\w+)$/, "-#{width}\\1")

    base_path = @site.in_source_dir("images")
    disk_destination = Pathname.new(destination).relative_path_from(base_path).to_s.prepend("/images/")

    if @source_path.include?("/_posts/")
      site_path = disk_destination.sub("/images/", "/")
    else
       #  
    end

    source_disk = @source_path
    unless source_disk && File.exist?(source_disk)
      Bridgetown.logger.error "SourceImage:", "Original source not found for #{@source_path}; skipping resize"
      return nil
    end

    unless File.exist?(destination)
      Bridgetown.logger.info "Resizing image: #{source_disk} to #{destination}"
      Bridgetown.logger.warn "Path: #{disk_destination}"
      FileUtils.mkdir_p(File.dirname(destination))
      pipeline = ImageProcessing::Vips.source(source_disk).resize_to_limit(width, width)
      pipeline.call(destination: destination.to_s)
    else
      Bridgetown.logger.debug "Resized image exists: #{destination}"
    end

    # file = Bridgetown::StaticFile.new(@site, @site.source, File.dirname(disk_destination), File.basename(disk_destination))
    # @site.static_files << file
    # # file.write(site_path)
    # puts("File Count: #{@site.static_files.count}")

    SiteImage.new(destination, site_path)
  end
end

class ImageProcessor < SiteBuilder
    def build
        Bridgetown.logger.info " ImageProcessor:", "Resizing images and reformatting image tags."
        hook :resources, :pre_render do |resource|
            # convert post-based image defined in front matter, because they are not always included in the content
            # also rewrite the "image" path to the resized version, so the RSS feed maker gets the correct path.
            if image = resource.data["image"]
                image = SourceImage.from_src(image, resource, site)
                # ensure large is generated so dimensions are available if needed
                large_img = image.large
                small_img = image.small
                next unless large_img && small_img

                resource.data["image"] = small_img.site_path
            end
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
