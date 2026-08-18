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

    def build
      hook :site, :post_read do |site|
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
        apply_defaults(resource, slug)
      end

      report_orphans(seen)
      Bridgetown.logger.info "ScadModels:", "Parsed #{seen.length} customizable #{"model".pluralize(seen.length)}"
    end

    def schema_for(slug, path)
      source = File.read(path, encoding: "UTF-8")
      model = ScadCustomizer.parse(source, slug: slug, presets: presets_for(slug))
      model.to_h.merge(
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
      resource.data[:title] ||= schema["title"]
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
  end
end
