---
title: Tags
description: Explore posts based on tags.
---

<ul class="tags">
  <% site.taxonomies["tag"].sort.each do |tag, items| %>
    <li>
      <%= link_to_tag tag %>
    </li>
  <% end %>
</ul>
