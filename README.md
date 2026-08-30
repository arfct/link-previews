# link-previews

Best practices and working code for **link previews** (unfurls): the card a URL turns
into when pasted in iMessage, Slack, Twitter/X, Discord, WhatsApp, or Telegram.

Distilled from several production implementations. Generic — nothing here depends on a
particular framework or host; the examples use web-standard `Request`/`Response` and run
on Cloudflare Workers, Netlify Edge, Deno, and Bun unchanged.

## The mental model

A link preview is HTML served to a **crawler**, not a person. Every messaging platform
fetches the URL with a bot user-agent, parses `<meta>` tags out of the `<head>`, and
renders a card from them. This means:

1. **Two audiences, one URL.** Bots need meta tags; humans need the real page (or a
   redirect to it). You can serve both from one response, or branch on user-agent.
2. **Tags are the API.** Open Graph (`og:*`) is the lingua franca; `twitter:*` tags
   override it on some platforms; a handful of `<link>` tags control icons.
3. **No JavaScript.** Crawlers don't execute scripts. Everything must be in the raw HTML.
4. **Previews are cached.** Most platforms cache the first fetch aggressively (Slack and
   iMessage effectively forever per-conversation). Get it right before sharing.

## The canonical tag set

```html
<head>
  <meta charset="utf-8" />
  <title>Page Title</title>

  <!-- Open Graph: read by everyone -->
  <meta property="og:title" content="Sales report for Q1 2025" />
  <meta property="og:description" content="Revenue up 12% vs Q4 2024" />
  <meta property="og:image" content="https://example.com/chart.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name" content="Example" />
  <meta property="og:url" content="https://example.com/s/abc123" />
  <meta property="og:type" content="website" />

  <!-- Twitter/X: opt into the large-image card layout -->
  <meta name="twitter:card" content="summary_large_image" />

  <!-- Icons: the small-icon half of icon + thumbnail combos -->
  <link rel="icon" href="https://example.com/icon.png" />
  <link rel="apple-touch-icon" href="https://example.com/icon.png" />

  <!-- Discord accent color -->
  <meta name="theme-color" content="#5865f2" />
</head>
```

Rules that hold everywhere:

- **`og:image` must be an absolute URL.** Relative paths fail silently on most platforms.
- **1200×630 (1.91:1)** is the safe large-image size. Ship `og:image:width`/`height` so
  the first-ever fetch can lay out the card without downloading the image.
- **Escape everything** you interpolate into tag attributes (`&`, `<`, `>`, `"`, `'`).
  Preview metadata is user content in an HTML sink.
- **Keep images small.** WhatsApp skips `og:image` files much over ~600 KB.

## Guides

| Doc | Covers |
|---|---|
| [docs/imessage.md](docs/imessage.md) | iMessage: detecting its crawler, **masquerading as a social post to unlock descriptions**, icon + thumbnail combos |
| [docs/crawlers.md](docs/crawlers.md) | Identifying every platform's crawler, per-platform rendering behavior, caching, analytics hygiene |
| [docs/patterns.md](docs/patterns.md) | The three architectures: static tags, metadata-in-the-URL, stored-metadata share links; generating preview images |

## Examples

| Example | Pattern |
|---|---|
| [examples/share-link-service](examples/share-link-service) | **The most complete approach**: a short-link service where callers register arbitrary OG metadata against an ID; `/s/:id` serves crawler-aware tags and forwards humans. Supports descriptions in iMessage, large Twitter cards, video tags, icon + thumbnail. |
| [examples/url-encoded](examples/url-encoded) | Stateless edge function: the metadata lives **in the URL path itself** — no database, works on a static host with one edge function |
| [examples/static.html](examples/static.html) | The full tag set as a plain static page, annotated |

## Testing previews

- **iMessage** re-fetches when you paste a URL into the compose field — but caches per
  conversation once sent. Test in a conversation with yourself.
- **Slack** caches per-workspace; re-share in a different channel won't refetch. Use
  `/collapse` + delete + repost, or tweak the URL with a query param.
- Emulate crawlers with curl:

  ```bash
  curl -A "facebookexternalhit/1.1 Facebot Twitterbot/1.0" https://example.com/s/abc
  ```

- Validators: [opengraph.xyz](https://www.opengraph.xyz),
  Facebook's [Sharing Debugger](https://developers.facebook.com/tools/debug/) (also
  force-refreshes Facebook's cache).

## License

MIT
