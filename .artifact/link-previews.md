---
title: link-previews
date: 2026-08
status: released
category: infrastructure
tags: [web]
url: https://github.com/arfct/link-previews
links:
  source: https://github.com/arfct/link-previews
media:
  - src: imessage-cards.png
    caption: One page rendered twice by the repository's Swift tool, in iMessage's default layout and, with the two post tags added, in its post layout
    alt: Two link preview cards side by side, each with a bar chart above the title Sales report for Q1 2025; the right card adds a line of description and a small blue icon beside the title
unconfirmed: [date, status]
---

iMessage asks for a link preview with a user agent that names Safari, Facebook's crawler and Twitter's crawler at once. link-previews sets down behaviour of this kind for the cards that iMessage, Slack, X, Discord, WhatsApp and Telegram build from a pasted URL, in three guides with working code. Its README gives one set of meta tags that all six read.

The longest guide is the one on iMessage, which by default shows a title and an image and drops the page's icon whenever there is an image. A page that declares og:type article, an ActivityPub alternate link and a description is laid out as a social post, with the description in full under the image and the icon beside the title. The alternate link may be empty. A Swift tool renders the card on macOS with LinkPresentation, the framework Messages uses, so a preview can be checked without a phone; the image shows its output for the README's example page, served once without the two tags and once with them.

Two of the examples are services that run unchanged on Cloudflare Workers, Netlify Edge, Deno and Bun. One is a short-link service that stores metadata against an ID; the other reads the whole preview from the URL path and needs no database.

JavaScript, Swift. 2026.
