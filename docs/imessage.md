# iMessage link previews

iMessage is the platform with the most unusual behavior, and the one where the biggest
upgrade is available. By default it shows only a title and image, and it drops your icon
whenever there's an image. If your page looks like a **social media post**, iMessage
switches to a richer layout that shows the description and puts the icon beside the
image.

Everything here was checked against Apple's own renderer (see
[Testing without a phone](#testing-without-a-phone)), not inferred from screenshots.

## Detecting the iMessage crawler

Apple's link-preview fetcher deliberately impersonates other crawlers. The request for
your page carries a user-agent containing *all four* of these substrings at once:

```
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko)
Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0
```

A real Facebook or Twitter crawler never claims to be Safari, so the four-way match is a
reliable fingerprint:

```js
function isIMessage(userAgent) {
  const ua = userAgent.toLowerCase();
  return ["safari", "applewebkit", "facebookexternalhit", "twitterbot"]
    .every((s) => ua.includes(s));
}
```

On macOS, the same fetch also makes a few requests with a
`com.apple.WebKit.Networking/… Network/… macOS/…` user-agent. Don't block or rate-limit
those, and don't serve them anything you'd want counted as a human visit.

## The three layouts

Which layout iMessage picks depends on two things: whether the page reads as a social
post, and what the page provides.

| Page provides | Default layout | Post layout |
|---|---|---|
| Image, description, icon | Image, then title and domain. **No icon, no description.** | Image, then description, then icon beside title and domain |
| Image and icon, no description | Image, then title and domain. No icon. | Same as default: post layout needs a description |
| Icon, no image | Title and domain, icon on the right | Same as default |

Two consequences catch people out:

- **An image hides the icon.** In the default layout, `og:image` and
  `<link rel="icon">` never appear together. If you're seeing the image but not the
  icon, the tags are probably fine. You need the post layout.
- **The post layout needs a description.** Without `og:description`, iMessage ignores the
  post signals and falls back to the default layout, icon and all.

In the post layout, the description sits *above* the title, like a post body above
its author line. Preview UIs that mimic iMessage should put it there.

## Opting into the post layout

iMessage has a special layout for social media posts (tweets, Mastodon/Fediverse posts).
You opt into it by making your page *look like* a Fediverse post. Two tags do it:

```html
<meta property="og:type" content="article" />
<link rel="alternate" type="application/activity+json" href="" />
```

The `activity+json` alternate link is the ActivityPub discovery tag every Mastodon post
page carries. Its presence is the signal; the `href` can be empty. With both tags and a
description, iMessage renders:

- `og:image`: the large image
- `og:description`: the post body, in full
- `<link rel="icon">` / `apple-touch-icon`: a small icon in the author position
- `og:title` and the domain: beside the icon

That pairing is the **icon + image combo**: the icon reads as "who", the image reads as
"what". Set both, and set a description, or you get neither.

### Turn it on for every iMessage fetch

Serve the two tags whenever the request comes from iMessage. That's what makes the icon
show up on every link with an image, not only the ones someone remembered to flag:

```js
if (isIMessage(userAgent)) {
  tags.push(`<meta property="og:type" content="article" />`);
  tags.push(`<link rel="alternate" type="application/activity+json" href="" />`);
}
```

Other platforms ignore the alternate link, so you could also serve the tags to everyone.
Gating on the user-agent keeps `og:type` accurate for Facebook, which reads it.

If you need an escape hatch for a particular link, make it an opt-*out* (redirect.app
uses a `p/0` path key), not an opt-in. An opt-in means most links lose their icon.

### Things that don't matter

Comparing a working production service against a minimal one, none of these changed
which layout iMessage chose:

- a full `<!DOCTYPE html><html><head>` document versus bare tags
- `twitter:title` / `twitter:description` / `twitter:image` mirrors
- `type="image/png"` on the icon link
- `og:url` pointing at the share link versus the destination
- a redirect as a `<script>` before the image tags versus a meta refresh after them
- an emoji PNG versus an `.ico` favicon

### Caveats

This exploits a rendering heuristic, not a documented API. A future iOS release could
tighten the check, for example by fetching the ActivityPub JSON. Keep the default-layout
tags correct so the preview degrades to title and image.

## Workaround for the default layout: fold the description into the title

If you can't use the post layout, the title is the only text that renders. Put the second
line *in* the title, only for the iMessage crawler, so other platforms keep a clean title:

```js
const ogTitle = isIMessage(ua) ? `${title}\n${subtitle}` : title;
```

Newlines in `og:title` render as line breaks in the iMessage card.

## Testing without a phone

Messages builds previews with Apple's LinkPresentation framework, which also ships on
macOS. You can drive it directly and get the same answer as a phone, without
per-conversation caching getting in the way.

[`tools/lp-render.swift`](../tools/lp-render.swift) fetches each URL the way Messages
does, prints what LinkPresentation extracted, and renders the card to a PNG with
`LPLinkView`:

```bash
swiftc -O tools/lp-render.swift -o lp-render
./lp-render out/ plain=https://example.com/a post=https://example.com/b
```

The printed fields tell you why a card looks the way it does:

| Field | Meaning |
|---|---|
| `usesActivityPub = 1` | The post signals registered |
| `itemType = article` | `og:type` was read |
| `summary` | The description it found |
| `icon` / `image` present | It fetched both. If the PNG lacks one, the layout dropped it. |

It also works against `localhost`, so you can serve tag variants from a scratch server
and see the effect of each tag on its own.

## Other iMessage quirks

- **Per-conversation caching.** Once a link has been sent, iMessage keeps the preview it
  captured. Pasting the same URL into the compose box re-fetches, so iterate there.
- **The sender's device fetches the preview**, not Apple's servers. The request comes
  from a residential IP with the user-agent shown earlier.
- **Videos**: `og:video` with `og:video:type` (e.g. `video/mp4`) can produce an inline
  playable preview; the file must be directly fetchable (no auth, correct CORS).
- **Serve tags at the shared URL.** Simple 301/302 chains do get followed, but every hop
  is a chance for a platform to give up.
