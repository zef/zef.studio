class TitleFromHeading < SiteBuilder
    VERBOSE = false

    def build
        Bridgetown.logger.info " TitleFromHeading:", "Generating titles from first markdown header"

        hook :resources, :pre_render do |resource|
            first_line = resource.content.lines.first
            old_title = resource.data["title"]

            if first_line =~ /^#\s+(.+)/
                resource.data["title"] = $1.strip
            end

            if VERBOSE && old_title != resource.data["title"]
                Bridgetown.logger.info "#{old_title} -> #{resource.data["title"]}"
            end
        end
    end
end
