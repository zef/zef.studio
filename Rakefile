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
  Rake::Task[:redirects].invoke
  `rsync -a output/ ~/code/zef-studio-output`
end

# What Netlify runs (netlify.toml): the deploy build, without the copy into
# ~/code/zef-studio-output.
desc "Build the site on Netlify"
task :netlify => [:clean, "frontend:build"] do
  Bridgetown::Commands::Build.start
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

# Short addresses printed on things, such as zef.studio/SensorShield on the
# SensorShield board, pointing at the pages that explain them.
desc "Write Netlify's _redirects into output/"
task :redirects do
  File.write("output/_redirects", <<~REDIRECTS)
    /SensorShield  /projects/sensorshield/  301
    /sensorshield  /projects/sensorshield/  301
  REDIRECTS
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
