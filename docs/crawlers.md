# Crawlers: detection, per-platform behavior, and hygiene

## Who fetches your link

| Platform | UA substring | Notes |
|---|---|---|
| iMessage | `facebookexternalhit` **+** `Twitterbot` **+** `Safari` **+** `AppleWebKit` | Impersonates FB and Twitter simultaneously — the combination is the fingerprint. Fetched from the sender's device. See [imessage.md](imessage.md). |
| Facebook / Messenger / Instagram | `facebookexternalhit` | Also honors the [Sharing Debugger](https://developers.facebook.com/tools/debug/) for cache busts |
| Twitter / X | `Twitterbot` | Reads `twitter:*` first, falls back to `og:*` |
| Slack | `Slackbot-LinkExpanding` | Caches per-workspace |
| Discord | `Discordbot` | Uses `theme-color` for the embed accent stripe |
| WhatsApp | `WhatsApp` | Image size limit (~600 KB); small preview unless image is big enough |
| Telegram | `TelegramBot` | Re-fetch on demand via [@WebpageBot](https://t.me/webpagebot) |
| LinkedIn | `LinkedInBot` | |
| Snapchat | `Snapchat` | |
| Search engines | `Googlebot`, `bingbot`, `YandexBot`, `Applebot` | Read OG too; also index the page |

## Detection

A broad match is fine for deciding "crawler vs. human" — false positives just mean a
human sees the (instantly redirecting) preview page:

```js
const BOT_UA_PATTERNS = [
  "bot", "crawler", "spider",
  "facebookexternalhit", "twitterbot", "linkedinbot",
  "slackbot", "discordbot", "whatsapp", "telegrambot", "snapchat",
  "googlebot", "applebot", "bingbot", "yandexbot",
];

const isBot = (ua) => {
  const lower = ua.toLowerCase();
  return BOT_UA_PATTERNS.some((p) => lower.includes(p));
};
```

Notes:

- Match **case-insensitively**; casing varies.
- The generic `"bot"` entry catches most long-tail crawlers, at the cost of some odd
  browsers. For preview serving that trade is fine; for security decisions it is not.
- `curl` is worth adding while developing so `curl <url>` shows you the tag output.

## What each platform renders

| | title | description | large image | small icon | video |
|---|---|---|---|---|---|
| iMessage (default) | ✅ | ❌ | ✅ | ✅ | ✅ |
| iMessage (social-post mode) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Slack | ✅ | ✅ | ✅ (`twitter:card` large) | ✅ favicon | ▶ some |
| Twitter/X | ✅ | ✅ | via `summary_large_image` | ❌ | player card |
| Discord | ✅ | ✅ | ✅ | ❌ | ✅ |
| WhatsApp | ✅ | ✅ | ✅ if under limits | ✅ | ❌ |
| Telegram | ✅ | ✅ | ✅ | ❌ | ✅ |

`twitter:card`:

- `summary` — small square thumbnail beside text.
- `summary_large_image` — full-width image above text. Almost always what you want;
  Slack and others also key off it.

## Caching

Assume the **first fetch is permanent**:

- Serve previews with modest HTTP cache headers so your own CDN absorbs crawler bursts
  but corrections propagate: `Cache-Control: public, max-age=300, s-maxage=300`.
- To change a preview that platforms have cached, change the URL (a query param works) or
  use the platform's refresh tool (Facebook Sharing Debugger, Telegram @WebpageBot).

## Analytics hygiene

Crawler hits are not human visits. If the preview URL counts views, skip bots — and
remember one shared link may be fetched by several crawlers plus prefetchers:

```js
if (!isBot(userAgent)) {
  incrementViewCount(id); // fire-and-forget; never block the response on analytics
}
```

Serving different HTML to crawlers than to humans is technically cloaking. For link
previews this is universally practiced and accepted — the tags describe the destination
truthfully. Keep it that way: previews that misrepresent the destination get domains
banned from unfurling on several platforms.
