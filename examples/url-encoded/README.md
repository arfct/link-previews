# url-encoded

Stateless previews: everything a crawler needs is encoded in the URL path, decoded by one
edge function. No database, no registration API — a preview link can be minted by hand,
by a bookmarklet, or by string concatenation in any program.

Pattern from [docs/patterns.md](../../docs/patterns.md#2-metadata-in-the-url-stateless);
distilled from [redirect.app](https://github.com/arfct/redirect-app) and
[itty.bitty](https://github.com/arfct/itty-bitty).

```
https://example.app/{title}/{key}/{value}/…/
```

| Key | Tag |
|---|---|
| first segment | `og:title` + `<title>` |
| `d` | `og:description` |
| `i`, `iw`, `ih` | `og:image` (+ width/height) |
| `v`, `vw`, `vh` | `og:video` (+ width/height) |
| `u` | `og:url` + human forwarding |
| `f` | favicon — a URL, or a bare emoji (served from Google's Noto PNG CDN) |
| `s` | `og:site_name` |
| `y` | `og:type` |
| `c` | `theme-color` hex |

Example:

```
/Launch--Day/d/We-shipped-it/f/🚀/i/:cdn.example.com%2Fhero.png/u/:example.com/
```

Titles and descriptions use pretty encoding (`-` → space, `--` → `-`, `---` → ` - `) so
links stay human-readable. URL values take a leading `:` as shorthand for `https://`.

The killer use case is giving a preview to something that can't carry one: an app deep
link (`myapp://…`), a custom URL scheme, a raw file URL, or a page with broken OG tags.
The wrapper link renders the card; the `u` value is where humans end up.

Extras:

- **`/m/` prefix** forces metadata mode for any user-agent — open `/m/<path>` in a
  normal browser to see exactly what crawlers get.
- **[bookmarklet.js](bookmarklet.js)** scrapes the current page's OG tags (with
  `<title>`/favicon fallbacks) and mints a wrapped link in one click.

Try it:

```bash
curl -A Twitterbot "http://localhost:8000/Hello--World/d/It-works/f/👋/"
```

Deploy notes: wire it as an edge function that runs in front of your static host
(Netlify Edge, Cloudflare Workers with a fall-through fetch, etc.). Returning
`undefined` for non-crawler traffic lets the request continue to the underlying site.
