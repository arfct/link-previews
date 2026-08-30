# iMessage link previews

iMessage is the platform with the most unusual behavior, and the one where the biggest
upgrade is available: by default it shows only a title and image, but if your page looks
like a **social media post**, iMessage switches to a richer layout that includes the
description and an icon + thumbnail combination.

## Detecting the iMessage crawler

Apple's link-preview fetcher deliberately impersonates other crawlers. Its user-agent
contains *all four* of these substrings at once:

```
Safari  ·  AppleWebKit  ·  facebookexternalhit  ·  Twitterbot
```

A real Facebook or Twitter crawler never claims to be Safari, so the four-way match is a
reliable fingerprint:

```js
function isIMessage(userAgent) {
  const ua = userAgent.toLowerCase();
  return (
    ua.includes("safari") &&
    ua.includes("applewebkit") &&
    ua.includes("facebookexternalhit") &&
    ua.includes("twitterbot")
  );
}
```

## Default rendering: no description

Out of the box, iMessage renders a preview from:

| Slot | Source |
|---|---|
| Title | `og:title`, falling back to `<title>` |
| Large image | `og:image` |
| Small icon | `<link rel="icon">` / `<link rel="apple-touch-icon">` |
| Domain line | the URL's host |

`og:description` is **ignored** in this default mode. Two ways to respond:

### Workaround A: fold the description into the title

Since only the title renders, put the important second line *in* the title — but only for
the iMessage crawler, so other platforms keep a clean title:

```js
const ogTitle = isIMessage(ua) ? `${title}\n${subtitle}` : title;
```

Newlines in `og:title` render as line breaks in the iMessage card.

### Workaround B: masquerade as a social post (the good one)

iMessage has a special rich layout for social media posts (tweets, Mastodon/Fediverse
posts): post text shown in full, author avatar as a small icon, media as a large
thumbnail. You can opt into that layout by making your page *look like* a Fediverse post.
Two tags do it:

```html
<meta property="og:type" content="article" />
<link rel="alternate" type="application/activity+json" href="" />
```

The `activity+json` alternate link is the ActivityPub discovery tag every Mastodon post
page carries — its mere presence is the signal; the `href` can be empty. Combined with
`og:type=article`, iMessage now renders:

- `og:title` — as the bold heading
- `og:description` — **displayed**, as the post body text
- `og:image` — as the inline media thumbnail
- `<link rel="icon">` / `apple-touch-icon` — as the small avatar-position icon

That last pairing is the **icon + thumbnail combo**: the icon reads as "who", the image
reads as "what". Set both.

Serve these two tags conditionally (only when `isIMessage(ua)`) if you want to be
conservative, or unconditionally — other platforms ignore the alternate link and treat
`article` as a normal type.

```js
if (isIMessage(userAgent)) {
  tags.push(`<meta property="og:type" content="article" />`);
  tags.push(`<link rel="alternate" type="application/activity+json" href="" />`);
}
```

**Caveats.** This exploits a rendering heuristic, not a documented API — a future iOS
release could tighten the check (e.g. actually fetching the ActivityPub JSON). Keep the
default-mode tags correct so the preview degrades gracefully to title + image.

## Other iMessage quirks

- **Per-conversation caching.** Once a link has been sent, iMessage keeps the preview it
  captured. Pasting the same URL into the compose box re-fetches, so iterate there.
- **The sender's device fetches the preview**, not Apple's servers — the request comes
  from a residential IP with the UA above.
- **Videos**: `og:video` with `og:video:type` (e.g. `video/mp4`) can produce an inline
  playable preview; the file must be directly fetchable (no auth, correct CORS).
- **No JS, no redirect-following for tags**: put the tags on the URL that is shared, not
  behind a 30x hop. (Simple 301/302 chains do get followed, but every hop is a chance for
  a platform to give up — serve tags at the shared URL when you can.)
