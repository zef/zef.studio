require 'fileutils'

DRAFT_PATH = "/Users/zef/Library/Mobile Documents/com~apple~CloudDocs/studio-drafts/"


task :default do
  `rsync -a Output/ ~/code/zef-studio-output`
end


desc "List Drafts"
task :drafts do
  puts Dir[ "#{DRAFT_PATH}*.md" ]
end

