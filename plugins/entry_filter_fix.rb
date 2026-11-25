# Bridgetown 2.1.2 builds a collection's EntryFilter with base directory
# "_posts", then strips the source path from it with `delete_prefix!`, which
# returns nil when there's nothing to strip. Paths then get checked against
# `exclude` without their "_posts/", so the "_posts/**/*.jpg" excludes in
# config/initializers.rb never matched, and every post's full-size original
# photos (some with GPS location) were copied into the output beside the
# resized ones. The non-bang delete_prefix keeps the folder. Remove this once
# Bridgetown fixes it upstream.
module EntryFilterFix
  def derive_base_directory(site, base_dir) = base_dir.delete_prefix(site.source)
end

Bridgetown::EntryFilter.prepend(EntryFilterFix)
