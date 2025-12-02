class InferTitle < SiteBuilder
    VERBOSE = true

    def build
        puts " InferTitle Plugin: Inferring titles from first markdown header"

        hook :resources, :pre_render do |resource|
            first_line = resource.content.lines.first
            old_title = resource.data["title"]

            if first_line =~ /^#\s+(.+)/
                resource.data["title"] = $1.strip
            end

            if VERBOSE && old_title != resource.data["title"]
                puts "#{old_title} -> #{resource.data["title"]}"
            end
        end
    end
end
