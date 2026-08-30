# share-link-service

The stored-metadata pattern from [docs/patterns.md](../../docs/patterns.md#3-stored-metadata--short-link-the-most-complete),
as one self-contained file. In-memory store — swap `put`/`store.get` for a database.

```bash
bun run server.js
```

Register a preview:

```bash
curl -s localhost:3000/social-metadata -X POST -H 'content-type: application/json' -d '{
  "forwardingUrl": "/reports/q1-2025",
  "iconUrl": "https://example.com/icon.png",
  "metadata": {
    "og:title": "Sales report for Q1 2025",
    "og:description": "Revenue up 12% vs Q4 2024",
    "og:image": "https://example.com/chart.png",
    "og:image:width": "1200",
    "og:image:height": "630"
  }
}'
```

See what each crawler sees:

```bash
# Slack
curl -A "Slackbot-LinkExpanding 1.0" localhost:3000/s/<id>

# iMessage — note the extra og:type=article + activity+json tags
curl -A "Mozilla/5.0 AppleWebKit/605.1.15 Safari/605.1.15 facebookexternalhit/1.1 Facebot Twitterbot/1.0" localhost:3000/s/<id>
```

What it demonstrates:

- open `og:*` metadata vocabulary, validated at write time, emitted verbatim
- iMessage detection and the social-post masquerade (description + icon/thumbnail combo)
- `twitter:*` mirror tags with `summary_large_image`
- meta-refresh + `location.replace` human forwarding, with correct per-context escaping
- bot-aware view counting and CDN-friendly cache headers
- `forwardingUrl` constrained to a relative path — no open redirect
