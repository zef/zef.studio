# Reads OpenSCAD Customizer annotations out of a .scad file.
#
# The annotation syntax is OpenSCAD's own, so an annotated model opens in
# desktop OpenSCAD's Customizer panel exactly as it appears on the website —
# the .scad file is the single source of truth for what's adjustable:
#
#   /* [Section Name] */
#
#   // Description shown under the control
#   width = 10;         // [1:0.5:50]     slider: min:step:max
#   depth = 10;         // [1:50]         slider: min:max
#   style = "round";    // [round, square] dropdown
#   corner = "r";       // [r:Rounded, s:Square] dropdown with labels
#   enabled = true;                       checkbox
#   label = "Hello";    // [16]           text, max length
#
#   /* [Hidden] */      everything after this is internal
#
# One extra annotation is ours rather than OpenSCAD's. A model that builds
# several printable pieces from one file can nominate the variable that selects
# between them:
#
#   // scad-web: parts = part
#   part = "tube"; // [tube:Tube, cap:Cap]
#
# which turns that dropdown into an export checklist on the website — each
# ticked part is rendered on its own and gets its own filename. Desktop
# OpenSCAD ignores the comment and shows the ordinary dropdown.
#
# Only variables assigned a plain literal are treated as parameters, which is
# also the rule OpenSCAD itself applies — anything computed from other
# variables isn't independently settable.
module ScadCustomizer
  # A section heading OpenSCAD treats as "don't show these".
  HIDDEN_SECTION = "hidden".freeze

  SECTION    = %r{\A\s*/\*\s*\[([^\]]+)\]\s*\*/\s*\z}
  DIRECTIVE  = %r{\A\s*//\s*scad-web:\s*(\w+)\s*=\s*(.+?)\s*\z}
  COMMENT    = %r{\A\s*//\s?(.*)\z}
  ASSIGNMENT = %r{\A\s*(\$?[A-Za-z_]\w*)\s*=\s*(.*?)\s*;\s*(?://\s*(.*?)\s*)?\z}

  NUMBER  = /\A-?\d+(?:\.\d+)?\z/
  BOOLEAN = /\A(true|false)\z/
  STRING  = /\A"(.*)"\z/m
  VECTOR  = /\A\[\s*(.*?)\s*\]\z/m

  # Labels we'd rather not run through the humanizer.
  LABEL_OVERRIDES = {
    "$fn" => "Facets per circle",
  }.freeze

  class Parameter
    ATTRIBUTES = %i[name label description type default min max step options group max_length unit].freeze
    attr_accessor(*ATTRIBUTES)

    def initialize(**attrs)
      attrs.each { |key, value| public_send(:"#{key}=", value) }
    end

    def to_h
      ATTRIBUTES.each_with_object({}) do |key, hash|
        value = public_send(key)
        hash[key.to_s] = value unless value.nil?
      end
    end
  end

  class Model
    attr_reader :slug, :source, :title, :summary, :directives, :parameters, :presets, :group_notes

    def initialize(slug:, source:, title:, summary:, directives:, parameters:, presets:, group_notes: {})
      @slug = slug
      @source = source
      @title = title
      @summary = summary
      @directives = directives
      @parameters = parameters
      @presets = presets
      @group_notes = group_notes
    end

    # The parameter this model nominates as its part selector, if any. Its
    # options are the pieces the file can build — the website renders each
    # ticked one separately rather than offering a single dropdown.
    def part_selector
      return nil unless directives["parts"]

      parameters.find { |param| param.name == directives["parts"] }
    end

    def parts
      return @parts if defined?(@parts)

      selector = part_selector
      @parts =
        if selector.nil? || selector.type != "enum"
          nil
        else
          {
            "parameter" => selector.name,
            "default" => selector.default,
            # The comment above the assignment explains the choice, so it
            # serves as the section's note the way `scad-web: note` does.
            "note" => selector.description,
            "options" => selector.options,
          }.compact
        end
    end

    # A nominated selector that can't do the job is worth saying out loud at
    # build time: the page still works, but silently as a single-part model.
    def warnings
      declared = directives["parts"]
      return [] if declared.nil?

      selector = part_selector
      if selector.nil?
        ["scad-web: parts names `#{declared}`, which is not a parameter in this file"]
      elsif selector.type != "enum"
        ["scad-web: parts names `#{declared}`, which needs a `// [a:Label A, b:Label B]` " \
         "annotation listing the parts"]
      else
        []
      end
    end

    # Parameters bucketed by their section, in the order the file declares them.
    # The part selector is left out: it is presented as the export checklist
    # instead, and offering it twice would let the two disagree.
    def groups
      exported = parts&.dig("parameter")
      parameters.reject { |param| param.name == exported }
                .group_by(&:group).map do |name, params|
        { "name" => name, "note" => group_notes[name], "parameters" => params.map(&:to_h) }.compact
      end
    end

    def defaults
      parameters.each_with_object({}) { |param, hash| hash[param.name] = param.default }
    end

    def to_h
      {
        "slug" => slug,
        "title" => title,
        "summary" => summary,
        "libraries" => directives["libraries"] || [],
        "fonts" => directives.fetch("fonts", false),
        "features" => directives["features"],
        "groups" => groups,
        "parts" => parts,
        # Deliberately still includes the part selector: the .scad download and
        # the source view need a value for it even though no control sets one.
        "defaults" => defaults,
        "presets" => presets,
      }.compact
    end
  end

  class << self
    def parse(source, slug: nil, presets: nil)
      # Match against chomped lines: several patterns anchor with \z, which a
      # trailing newline would otherwise defeat.
      lines = source.lines.map(&:chomp)
      title, summary, directives, body_start = parse_header(lines)
      parameters, group_notes = parse_parameters(lines, body_start)
      Model.new(
        slug: slug,
        source: source,
        title: title,
        summary: summary,
        directives: directives,
        parameters: parameters,
        presets: normalize_presets(presets, parameters),
        group_notes: group_notes
      )
    end

    private

    # The leading comment block is the model's own documentation: first line is
    # the title, the rest is prose. `scad-web:` lines are configuration, not prose.
    def parse_header(lines)
      title = nil
      prose = []
      directives = {}
      index = 0

      lines.each_with_index do |line, i|
        index = i
        if (match = DIRECTIVE.match(line))
          apply_directive(directives, match[1], match[2])
          next
        end
        break unless (match = COMMENT.match(line)) || line.strip.empty?
        next if line.strip.empty? && title.nil?
        break if match.nil?

        text = match[1].rstrip
        if title.nil?
          title = text
        else
          prose << text
        end
      end

      [title, prose.join("\n").strip, directives, index]
    end

    def apply_directive(directives, key, value)
      case key
      when "libraries", "features"
        directives[key] = value.split(%r{[,\s]+}).reject(&:empty?)
      when "fonts"
        directives[key] = value.strip == "true"
      else
        directives[key] = value.strip
      end
    end

    def parse_parameters(lines, start_index)
      group = "Parameters"
      hidden = false
      description = []
      parameters = []
      group_notes = {}
      unit = nil

      lines[start_index..].to_a.each do |line|
        if (match = SECTION.match(line))
          group = match[1].strip
          hidden = group.downcase == HIDDEN_SECTION
          description = []
          unit = nil
          next
        end

        # `scad-web:` lines are configuration rather than prose. A `note`
        # annotates the section it follows; a `unit` annotates the next
        # parameter. Both are plain comments, so OpenSCAD ignores them.
        if (match = DIRECTIVE.match(line))
          case match[1]
          when "note" then group_notes[group] = match[2].strip
          when "unit" then unit = match[2].strip
          end
          next
        end

        if (match = COMMENT.match(line))
          description << match[1].rstrip
          next
        end

        if line.strip.empty?
          # A blank line separates one parameter's notes from the next.
          description = []
          next
        end

        if !hidden && (match = ASSIGNMENT.match(line))
          param = build_parameter(
            name: match[1],
            literal: match[2],
            annotation: match[3],
            description: description.join(" ").strip,
            group: group,
            unit: unit
          )
          parameters << param if param
        end

        description = []
        unit = nil
      end

      [parameters, group_notes]
    end

    def build_parameter(name:, literal:, annotation:, description:, group:, unit: nil)
      default = parse_literal(literal)
      # Anything computed rather than assigned outright isn't a parameter.
      return nil if default == :not_a_literal

      param = Parameter.new(
        name: name,
        label: label_for(name),
        description: description.empty? ? nil : description,
        default: default,
        group: group,
        type: type_for(default),
        unit: unit_for(name, default, unit)
      )
      apply_annotation(param, annotation)
      param
    end

    # These are CAD models, so a bare number is a length in millimetres unless
    # the model says otherwise. Special variables like $fn never are.
    def unit_for(name, default, declared)
      return declared if declared
      return nil unless default.is_a?(Numeric)
      return "none" if name.start_with?("$")

      "mm"
    end

    def label_for(name)
      return LABEL_OVERRIDES[name] if LABEL_OVERRIDES.key?(name)

      name.sub(/\A\$/, "").tr("_", " ").split.map(&:capitalize).join(" ")
    end

    def type_for(value)
      case value
      when true, false then "boolean"
      when Numeric then "number"
      when Array then "vector"
      else "string"
      end
    end

    def parse_literal(text)
      text = text.strip
      case text
      when BOOLEAN then text == "true"
      when NUMBER then text.include?(".") ? text.to_f : text.to_i
      when STRING then Regexp.last_match(1)
      when VECTOR then parse_vector(Regexp.last_match(1))
      else :not_a_literal
      end
    end

    def parse_vector(inner)
      return [] if inner.strip.empty?

      values = inner.split(",").map { |part| parse_literal(part) }
      values.include?(:not_a_literal) ? :not_a_literal : values
    end

    # `// [ ... ]` after an assignment constrains the control.
    def apply_annotation(param, annotation)
      return if annotation.nil?

      inner = annotation[/\A\[(.*)\]\z/m, 1]
      return if inner.nil?

      inner = inner.strip
      if param.type == "number" && (range = parse_range(inner))
        param.min, param.step, param.max = range
      elsif param.type == "string" && inner.match?(NUMBER)
        param.max_length = inner.to_i
      else
        options = parse_options(inner)
        return if options.empty?

        param.type = "enum"
        param.options = options
      end
    end

    # "min:max" or "min:step:max" — numeric only, and no commas, which would
    # mean it's a list of choices instead.
    def parse_range(inner)
      return nil if inner.include?(",")

      parts = inner.split(":", -1).map(&:strip)
      return nil unless parts.all? { |part| part.match?(NUMBER) }

      case parts.length
      when 2 then [parts[0].to_f, nil, parts[1].to_f]
      when 3 then [parts[0].to_f, parts[1].to_f, parts[2].to_f]
      end
    end

    # "a, b, c" or "a:Label A, b:Label B". Values can't contain commas or
    # colons — same limitation OpenSCAD's own customizer has.
    def parse_options(inner)
      inner.split(",").filter_map do |entry|
        entry = entry.strip
        next if entry.empty?

        value, label = entry.split(":", 2).map(&:strip)
        { "value" => coerce_option(value), "label" => label || value }
      end
    end

    def coerce_option(value)
      value.match?(NUMBER) ? (value.include?(".") ? value.to_f : value.to_i) : value
    end

    # OpenSCAD writes parameter sets with every value as a string; turn them
    # back into the types the matching parameter actually uses.
    def normalize_presets(presets, parameters)
      return nil if presets.nil?

      sets = presets["parameterSets"] || presets
      return nil unless sets.is_a?(Hash)

      types = parameters.each_with_object({}) { |param, hash| hash[param.name] = param }

      sets.transform_values do |values|
        values.each_with_object({}) do |(name, raw), hash|
          param = types[name]
          next if param.nil?

          hash[name] = coerce_preset(raw, param)
        end
      end
    end

    def coerce_preset(raw, param)
      return raw unless raw.is_a?(String)

      case param.type
      when "number" then raw.include?(".") ? raw.to_f : raw.to_i
      when "boolean" then raw == "true"
      when "vector" then parse_literal(raw)
      else raw
      end
    end
  end
end
