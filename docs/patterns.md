# Architectures for serving previews

Three patterns, in increasing order of capability. All share the same core: put the tags
in raw HTML at the shared URL, escape everything, keep humans moving to the real content.

## 1. Static tags

The page itself carries its tags ([examples/static.html](../examples/static.html)).
Right for pages whose preview never varies. The only work is doing the tag set correctly
— and remembering server-side rendering: tags injected by client-side JS **do not exist**
as far as crawlers are concerned.

For SPAs, rewrite the `<head>` server-side before returning the app shell:

```js
const html = baseHtml.replace(/<head>[\s\S]*?<\/title>/, renderedHeadSection);
```

## 2. Metadata in the URL (stateless)

Encode the entire preview into the URL path and decode it in an edge function — no
database, no registration step, works on a static host. Anyone (or any program) can mint
a preview just by constructing a URL:

```
https://example.app/Launch--Day/d/We-shipped-it/i/:cdn.example.com%2Fhero.png/u/:example.com/
```

An edge function parses `/{title}/key/value/key/value/…`, and only bothers when the
requester is a crawler — everyone else falls through to the static site. See
[examples/url-encoded](../examples/url-encoded).

Tricks that make this pleasant:

- **Pretty encoding**: `-` → space, `--` → literal `-`, so titles are readable in the URL.
- **Compact keys**: one letter per tag (`d` description, `i` image, `f` favicon, …).
- **Emoji favicons**: a bare emoji as the favicon value resolves to Google's Noto emoji
  PNGs — a free icon CDN:

  ```js
  const codepoints = Array.from(emoji).map((c) => c.codePointAt(0).toString(16));
  const href = `https://fonts.gstatic.com/s/e/notoemoji/14.0/${codepoints.join("_")}/128.png`;
  ```

Limits: URLs leak their contents (no private data), practical length caps (~2 KB safe,
16 KB hard on some CDNs), and you can't edit a preview after the link is out.

## 3. Stored metadata + short link (the most complete)

A registration API stores arbitrary OG metadata against an ID; a `/s/:id` route serves
crawler-aware tags and forwards humans. This is the pattern to reach for when previews
are minted programmatically — by an app, a pipeline, or an AI agent sharing its output.
See [examples/share-link-service](../examples/share-link-service).

```
POST /social-metadata          { forwardingUrl, metadata: { "og:title": …, … } }
  →  { id }                    →  share https://example.com/s/{id}

GET /s/{id}                    crawler → tag page;  human → redirect
```

Why it wins:

- **Full tag vocabulary.** The stored metadata is an open key-value map of `og:*` tags —
  title, description, image + dimensions, video + type/dimensions — validated at write
  time, emitted verbatim at read time. New tags need no new code.
- **Short, opaque URLs** that don't leak the preview contents.
- **Editable and measurable**: update the stored record to fix a preview; count
  non-bot hits for view analytics.
- **Per-crawler tailoring** happens at serve time: iMessage social-post masquerade,
  `twitter:*` mirrors, icon + thumbnail pairing (see [imessage.md](imessage.md)).

The serve-side response handles humans with a double redirect — meta refresh for anything
that doesn't run JS, `location.replace` so the share URL doesn't pollute history:

```html
<meta http-equiv="refresh" content="0;url=https://example.com/real-page" />
<script>window.location.replace("https://example.com/real-page")</script>
```

Escape the URL for each context: HTML-escaped in the meta tag, `JSON.stringify` **plus
`<` → `<`** in the script (prevents `</script>` breakout).

A plain 302 for non-bots also works and is simpler; the HTML page is preferable when you
want the same response cacheable for both audiences, or an interstitial.

### Validation at write time

Constrain what callers can store — it lands in HTML you serve:

- `og:title` required, non-empty; everything else optional.
- `forwardingUrl` must be a relative path (`^/`) or an allow-listed origin. Never let
  callers turn your domain into an open redirect.
- Escape on output regardless (`&`, `<`, `>`, `"`, `'`) — validation is not sanitization.
- Rate-limit both registration and serving.

## Generating preview images

The `og:image` often doesn't exist yet — it's a chart, a card, a rendering of the content
itself. The workable pipeline is **author SVG, rasterize to PNG** (crawlers don't
reliably render SVG in `og:image`):

- Author the card as SVG (text layout, brand colors, data baked in).
- Rasterize server-side with resvg (WASM, runs at the edge) — e.g.
  [arfct/og-svg](https://github.com/arfct/og-svg), a shared SVG→PNG worker.
- Two gotchas from that pipeline: embedded images must be `data:` URIs (no network in
  the sandbox), and fonts must be named explicitly (no system font stack).
- Emit `og:image:width`/`og:image:height` alongside, and target 1200×630.
