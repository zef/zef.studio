require "digest/md5"
require "fileutils"
require "image_processing/vips"

# Attaches parsed OpenSCAD parameter schemas to the models collection.
#
# Each resource in `src/_models` pairs with a `.scad` file of the same name in
# `src/3d-printing/models`, and optionally a `.json` file of saved parameter
# sets in OpenSCAD's own format. Everything the customizer needs — parameters,
# ranges, descriptions, presets — is read out of those two files at build time,
# so adding a model is: drop in the .scad, write a short page, done.
module Builders
  class ScadModels < SiteBuilder
    COLLECTION = "models".freeze
    MODEL_DIR = File.join("src", "3d-printing", "models").freeze
    PREVIEW_DIR = File.join("src", "3d-printing", "previews").freeze
    WORKER_DIR = File.join("src", "3d-printing", "worker").freeze
    PHOTO_OUT_DIR = File.join("src", "3d-printing", "photos").freeze

    # Photographs of the printed part live in a folder named for the model,
    # beside its .scad file. Dropping a photo in is the whole workflow.
    PHOTO_EXTENSIONS = %w[.jpg .jpeg .png].freeze

    # A thumbnail big enough for a retina grid cell, and a full size for the
    # lightbox. Deliberately smaller than the site's post images, which are
    # sized for full-width display rather than a grid of thumbs.
    PHOTO_SIZES = { thumb: 700, full: 2400 }.freeze

    # Where to send someone who wants to know what a library a model depends on
    # actually is. Kept apart from the plain `libraries` list, which is the
    # contract with the render worker.
    LIBRARY_URLS = {
      "BOSL2" => "https://github.com/BelfrySCAD/BOSL2/wiki",
    }.freeze

    def build
      # Resizing happens before the site reads its files, so the variants exist
      # by the time static files are collected. Generating them later would
      # publish them only on the *next* build, which is a confusing way for a
      # gallery to behave.
      hook :site, :pre_read do
        prepare_photos
      end

      hook :site, :post_read do |site|
        # The worker and kernel are served as plain static ES modules rather
        # than going through the bundler, so they get no content hash of their
        # own. Give them a cache key derived from their contents.
        site.data[:scad_worker_version] = worker_version
        attach_schemas(site)
      end
    end

    private

    def attach_schemas(site)
      collection = site.collections[COLLECTION]
      return if collection.nil?

      seen = []
      collection.resources.each do |resource|
        slug = resource.data.model || resource.data.slug
        path = model_path(slug)

        unless File.exist?(path)
          Bridgetown.logger.warn "ScadModels:", "#{resource.relative_path} has no model at #{path}"
          next
        end

        seen << slug
        resource.data[:scad] = schema_for(slug, path)
        resource.data[:photos] = photos_for(slug)
        apply_defaults(resource, slug)

        if resource.data.placeholder_prose
          Bridgetown.logger.warn "ScadModels:",
                                 "#{resource.relative_path} still has generated placeholder prose"
        end
      end

      report_orphans(seen)
      Bridgetown.logger.info "ScadModels:", "Parsed #{seen.length} customizable #{"model".pluralize(seen.length)}"
    end

    def schema_for(slug, path)
      source = File.read(path, encoding: "UTF-8")
      model = ScadCustomizer.parse(source, slug: slug, presets: presets_for(slug))
      model.warnings.each { |warning| Bridgetown.logger.warn "ScadModels:", "#{slug}.scad — #{warning}" }
      model.to_h.merge(
        # The worker renders from this, so it travels with the page.
        "source" => source,
        "library_urls" => LIBRARY_URLS,
        "source_url" => "/3d-printing/models/#{slug}.scad",
        "source_bytes" => source.bytesize
      )
    end

    def presets_for(slug)
      path = File.join(MODEL_DIR, "#{slug}.json")
      return nil unless File.exist?(path)

      JSON.parse(File.read(path, encoding: "UTF-8"))
    rescue JSON::ParserError => e
      Bridgetown.logger.warn "ScadModels:", "Could not read presets for #{slug}: #{e.message}"
      nil
    end

    # Front matter wins; the .scad file fills in whatever it doesn't say.
    def apply_defaults(resource, slug)
      schema = resource.data[:scad]
      # Bridgetown always derives *some* title from the filename, so `||=` would
      # never let the model's own title through. Treat a title that is exactly
      # the titleized slug as the automatic one and prefer the .scad heading —
      # a real title in front matter still wins.
      if schema["title"] && (resource.data[:title].nil? || resource.data[:title] == slug.titleize)
        resource.data[:title] = schema["title"]
      end
      resource.data[:description] ||= first_sentence(schema["summary"])

      preview = File.join(PREVIEW_DIR, "#{slug}.png")
      resource.data[:image] ||= "/3d-printing/previews/#{slug}.png" if File.exist?(preview)
    end

    def first_sentence(summary)
      return nil if summary.nil? || summary.empty?

      # Summaries are hard-wrapped in the .scad file, so unwrap before splitting.
      text = summary.tr("\n", " ").squeeze(" ")
      text[/\A.*?\.(?=\s|\z)/] || text
    end

    def report_orphans(seen)
      return unless Dir.exist?(MODEL_DIR)

      orphans = Dir.glob(File.join(MODEL_DIR, "*.scad")).map { |f| File.basename(f, ".scad") } - seen
      orphans.each do |slug|
        Bridgetown.logger.warn "ScadModels:", "#{slug}.scad has no page in src/_#{COLLECTION}"
      end
    end

    def model_path(slug)
      File.join(MODEL_DIR, "#{slug}.scad")
    end

    # ---------------------------------------------------------------- photos

    # Walks every model's photo folder and makes sure the resized variants are
    # on disk. Runs before the read, so nothing depends on build ordering.
    def prepare_photos
      return unless Dir.exist?(MODEL_DIR)

      Dir.children(MODEL_DIR).sort.each do |slug|
        dir = File.join(MODEL_DIR, slug)
        next unless File.directory?(dir)

        photo_sources(dir).each do |source|
          base = File.basename(source, ".*")
          PHOTO_SIZES.each_value { |width| resize_photo(source, slug, base, width) }
        end
      end
    end

    def photo_sources(dir)
      Dir.children(dir).sort.filter_map do |name|
        next unless PHOTO_EXTENSIONS.include?(File.extname(name).downcase)

        File.join(dir, name)
      end
    end

    # Photographs of the printed part, from a folder named for the model beside
    # its .scad file. Filenames sort the gallery and caption it, so ordering and
    # wording are done by renaming files rather than by editing anything.
    def photos_for(slug)
      dir = File.join(MODEL_DIR, slug)
      return [] unless Dir.exist?(dir)

      photo_sources(dir).filter_map { |source| photo(slug, source) }
    end

    def photo(slug, source)
      base = File.basename(source, ".*")
      thumb = resize_photo(source, slug, base, PHOTO_SIZES[:thumb])
      full = resize_photo(source, slug, base, PHOTO_SIZES[:full])
      return nil unless thumb && full

      {
        "thumb" => thumb[:url],
        "full" => full[:url],
        # PhotoSwipe needs the real dimensions of the image it will open.
        "width" => full[:width],
        "height" => full[:height],
        "caption" => photo_caption(base),
      }.compact
    end

    def resize_photo(source, slug, base, width)
      out_dir = File.join(PHOTO_OUT_DIR, slug)
      file = File.join(out_dir, "#{base}-#{width}.jpg")

      unless File.exist?(file) && File.mtime(file) >= File.mtime(source)
        FileUtils.mkdir_p(out_dir)
        Bridgetown.logger.info "ScadModels:", "Resizing #{File.basename(source)} to #{width}px"
        ImageProcessing::Vips
          .source(source)
          .convert("jpg")
          .saver(quality: 82, strip: true)
          .resize_to_limit(width, width)
          .call(destination: file)
      end

      image = Vips::Image.new_from_file(file)
      { url: "/3d-printing/photos/#{slug}/#{File.basename(file)}", width: image.width, height: image.height }
    rescue StandardError => e
      Bridgetown.logger.warn "ScadModels:", "Couldn't prepare #{source}: #{e.message}"
      nil
    end

    # "02-printed-in-petg" becomes "Printed in petg". A leading number orders
    # the gallery without appearing in the caption.
    def photo_caption(base)
      text = base.sub(/\A\d+[-_ ]+/, "").tr("-_", "  ").squeeze(" ").strip
      return nil if text.empty?

      text.sub(/\A./, &:upcase)
    end

    def worker_version
      files = Dir.glob(File.join(WORKER_DIR, "*.js")).sort
      return "0" if files.empty?

      Digest::MD5.hexdigest(files.map { |f| File.read(f, encoding: "UTF-8") }.join)[0, 10]
    end
  end
end
