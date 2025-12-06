require "image_processing/vips"
require "ruby-vips"

class ImageProcessor < SiteBuilder
    def build
        Bridgetown.logger.info " ImageProcessor:", "Resizing images and reformatting image tags."
        hook :resources, :post_render do |resource|

        # puts resource.path
        next unless resource.data.layout == "page" || resource.data.layout == "post"
        next unless resource.output_ext == ".html"
        next unless resource.content

        # Process images and wrap in figure tags
        resource.output = process_images(resource.output, resource)
        
        # Count images after processing
        image_count = resource.output.scan(/<figure[^>]*>.*?<\/figure>/m).length
        resource.data["image_count"] = image_count if image_count > 0

        ## TODO make gallery for pswp
        end
    end

    private

    def process_images(content, resource)
        # convert post-based image defined in front matter, because they are not always included in the content
        if image = resource.data["image"]
            # puts "res image: " + image
            source_path = image_disk_source_path(image, resource)
            convert_image(source_path, 1248)
            convert_image(source_path, 3000)
        end

        # Match img tags that aren't already wrapped in figures
        content.gsub(/<img\s+([^>]*?)>/) do |match|
            attributes = parse_img_attributes($1, resource)
            
            # Skip if already in a figure (shouldn't happen but safety check)
            next match if content[0...content.index(match)].rindex("<figure") &&
                            content[0...content.index(match)].rindex("<figure") >
                            (content[0...content.index(match)].rindex("</figure") || -1)

            build_figure(attributes, resource)
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

    def image_disk_source_path(src, resource)
        unless src.start_with?("/")
            # look for image that is in the same folder as the resource
            src = File.join("_posts", resource.relative_url, src)
        end

        disk_path = site.in_source_dir(src)
        Bridgetown.logger.warn "Disk path: #{disk_path}"

        if !File.exist?(disk_path)
            # fallback to jpeg. we want to allow for .jpeg files, but make .jpg in the markdown always work
            disk_path.sub!(/jpg$/, "jpeg")
            if !File.exist?(disk_path)
                Bridgetown.logger.error "ImageProcessor:", "Source image not found: #{disk_path}"
                return ""
            end
        end

        return disk_path
    end

    def build_figure(attrs, resource)
        src = attrs[:src]
        alt = attrs[:alt] || ""
        caption = attrs[:caption]
        css_class = attrs[:class]

        source_path = image_disk_source_path(src, resource)
        
        small_src, _, _ = convert_image(source_path, 1248)
        large_src, width, height = convert_image(source_path, 3000)
        
        # Render using ERB template
        template = ERB.new(<<~ERB.strip, trim_mode: "-")
        <figure<%= css_class ? %( class="\#{css_class}") : "" %>>
            <a href="<%= large_src %>" data-pswp-width="<%= width %>" data-pswp-height="<%= height %>">
            <img src="<%= small_src %>" alt="<%= alt %>">
            </a>
            <%- if caption -%>
            <figcaption><%= caption %></figcaption>
            <%- end -%>
        </figure>
        ERB
        
        template.result(binding)
    end

    def convert_image(source, width)
        destination = source.sub("src/_", "src/images/")
                            .sub(/jpeg$/, "jpg")
                            .sub(/(\.\w+)$/, "-#{width}\\1")

        base_path = site.in_source_dir("images")
        relative_distination = Pathname.new(destination).relative_path_from(base_path).to_s.prepend("/images/")
        relative_distination.sub!("images/posts/", "images/")
        
        # TODO skip pngs, as they are already optimized and converting is increasing size

        if !File.exist?(destination)
            Bridgetown.logger.info "Resizing image: #{source} to #{width}×#{width}"
            FileUtils.mkdir_p(File.dirname(destination))
            pipeline = ImageProcessing::Vips.source(source).resize_to_limit(width, width)
            pipeline.call(destination: destination.to_s)
        else
            Bridgetown.logger.debug "Resized image exists: #{destination}"
        end

        image = Vips::Image.new_from_file(destination)

        # unless site.static_files.any? { |sf| sf.relative_path == relative_distination }
        #     site.static_files << Bridgetown::StaticFile.new(
        #         site,
        #         site.in_source_dir,
        #         File.dirname(relative_distination),
        #         File.basename(destination)
        #     )
        # end

        return relative_distination, image.width, image.height
    end
end
