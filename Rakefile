require 'fileutils'

# DRAFT_PATH = "/Users/zef/Library/Mobile Documents/com~apple~CloudDocs/studio-drafts/"
DRAFT_PATH = "/Users/zef/code/studio-drafts/"
CODE_PATH = "/Users/zef/code/studio/"


task :default do
  `rsync -a Output/ ~/code/zef-studio-output`
end

task :drafts_out do
  `mv #{CODE_PATH}/Content/drafts/*.md #{DRAFT_PATH}`
  `mv #{CODE_PATH}/Content/images/drafts/ #{DRAFT_PATH}/images`
  `mv #{CODE_PATH}/Resources/drafts/ #{DRAFT_PATH}/images/scaled`

  `sed -i -e 's#case drafts#// case drafts#g' ./Sources/Studio/main.swift`
end

task :drafts_in do
  `mv #{DRAFT_PATH}*.md #{CODE_PATH}Content/drafts/`
  `mv #{DRAFT_PATH}images/scaled/ #{CODE_PATH}Resources/drafts`
  `mv #{DRAFT_PATH}images/ #{CODE_PATH}Content/images/drafts`

  `sed -i -e 's#// case drafts#case drafts#g' ./Sources/Studio/main.swift`
end


desc "List Drafts"
task :drafts do
  puts Dir[ "#{DRAFT_PATH}*.md" ]
end

