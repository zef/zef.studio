module CustomHelpers
  def titleize_with_spans(title)
    return "" if title.nil?

    words = title.split(' ')
    new_words = []
    in_span = false

    words.each_with_index do |word, index|
      is_lowercase = word == word.downcase && word != word.upcase

      if is_lowercase && !in_span
        new_words << "<span>#{word}"
        in_span = true
      elsif is_lowercase && in_span
        new_words.last << " #{word}"
      elsif !is_lowercase && in_span
        new_words.last << "</span>"
        new_words << word
        in_span = false
      else
        new_words << word
      end
    end

    new_words.last << "</span>" if in_span

    new_words.join(' ').html_safe
  end

  def link_to_tag(tag)
    path = File.join("/tags", tag)
    text = tag.titleize
    if tag == "zef.studio"
      text = tag
    end
    link_to(text || tag, path)
  end

end

Bridgetown::RubyTemplateView::Helpers.include CustomHelpers
