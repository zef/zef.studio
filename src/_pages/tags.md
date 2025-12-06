---
title: Tags
---

<!-- <% all_tags = site.collections.posts.resources.flat_map { |post| post.data[:tags] }.compact.uniq.sort %> -->
<ul class="tags">
  <% site.taxonomies["tag"].sort.each do |tag, items| %>
    <li>
      <%= link_to_tag tag %>
    </li>
  <% end %>
</ul>

