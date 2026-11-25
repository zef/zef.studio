require "open3"

# Compiles frontend/styles/shared.sass to src/shared.css (gitignored), so every
# build, dev server included, publishes it at the fixed URL /shared.css that
# esbuild's hashed file names can't give. Builders run before the site reads
# its source, which is when Bridgetown collects the files it publishes; a
# `pre_read` hook registered here never fires on a one-off build. It writes
# only when the CSS changed, so the dev server's watcher doesn't loop.
module Builders
  class SharedCSS < SiteBuilder
    def build
      css, error, status = Open3.capture3(
        "npx", "sass", "--load-path=node_modules", "--style=compressed",
        "--no-source-map", "--quiet-deps", "frontend/styles/shared.sass",
        chdir: site.root_dir
      )
      raise "shared.css: #{error}" unless status.success?

      out = site.in_source_dir("shared.css")
      File.write(out, css) unless File.exist?(out) && File.read(out) == css
    end
  end
end
