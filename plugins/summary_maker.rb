require "nokogiri"

class SummaryMaker < SiteBuilder
  def build
    define_resource_method :summary_extension_output do
      fragment = Nokogiri::HTML::DocumentFragment.parse(content)

      first_two = fragment.css("p").first(2)

      if first_two.any?
        first_two.map(&:to_html).join("\n").html_safe
      else
        ""
      end
    end
  end
end
