require "bridgetown"

Bridgetown.load_tasks

# Run rake without specifying any command to execute a deploy build by default.
task default: :deploy

#
# Standard set of tasks, which you can customize if you wish:
#
desc "Build the Bridgetown site for deployment"
task :deploy => [:clean, "frontend:build"] do
  Bridgetown::Commands::Build.start
  Rake::Task[:shared_css].invoke
  `rsync -a output/ ~/code/zef-studio-output`
end

# /shared.css: the site's base styles for sibling sites such as
# store.zef.studio (see frontend/styles/shared.sass), and the header that lets
# that store load the fonts: browsers refuse cross-site web fonts without it.
desc "Build /shared.css and its CORS headers into output/"
task :shared_css do
  sh "npx sass --load-path=node_modules --style=compressed --no-source-map --quiet-deps frontend/styles/shared.sass output/shared.css"
  File.write("output/_headers", <<~HEADERS)
    /fonts/*
      Access-Control-Allow-Origin: https://store.zef.studio
    /shared.css
      Access-Control-Allow-Origin: https://store.zef.studio
  HEADERS
end

desc "Build the site in a test environment"
task :test do
  ENV["BRIDGETOWN_ENV"] = "test"
  Bridgetown::Commands::Build.start
end

desc "Runs the clean command"
task :clean do
  Bridgetown::Commands::Clean.start
end

namespace :frontend do
  desc "Build the frontend with esbuild for deployment"
  task :build do
    sh "npm run esbuild"
  end

  desc "Watch the frontend with esbuild during development"
  task :dev do
    sh "npm run esbuild-dev"
  rescue Interrupt
  end
end

#
# Add your own Rake tasks here! You can use `environment` as a prerequisite
# in order to write automations or other commands requiring a loaded site.
#
# task :my_task => :environment do
#   puts site.root_dir
#   automation do
#     say_status :rake, "I'm a Rake tast =) #{site.config.url}"
#   end
# end
