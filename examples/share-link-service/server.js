// Stored-metadata share-link service — the most complete link-preview pattern.
//
// POST /social-metadata   register { forwardingUrl, metadata } → { id, shareUrl }
// GET  /s/:id             crawlers get a tag page, humans get forwarded
//
// Web-standard Request/Response: runs on Bun (`bun run server.js`), Deno,
// Cloudflare Workers, or Netlify Edge with only the export shim changed.

const ORIGIN = process.env.ORIGIN ?? "http://localhost:3000";
const SITE_NAME = "Example";

// ---------------------------------------------------------------------------
// Store — swap for a real database. Interface: get(id), put(record) → id.
const store = new Map();
const put = (record) => {
  const id = crypto.randomUUID();
  store.set(id, record);
  return id;
};

// ---------------------------------------------------------------------------
// Crawler detection (see docs/crawlers.md and docs/imessage.md)

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

// iMessage impersonates Facebook and Twitter crawlers from a Safari UA;
// all four substrings together are its fingerprint.
const isIMessage = (ua) => {
  const lower = ua.toLowerCase();
  return (
    lower.includes("safari") &&
    lower.includes("applewebkit") &&
    lower.includes("facebookexternalhit") &&
    lower.includes("twitterbot")
  );
};

// ---------------------------------------------------------------------------
// Tag rendering

const escapeHtml = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function buildMetaTags(metadata, requestUrl, forwardingUrl, iconUrl, userAgent) {
  const tags = [
    `<meta charset="utf-8" />`,
    `<title>${escapeHtml(metadata["og:title"])}</title>`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:url" content="${escapeHtml(requestUrl)}" />`,
  ];

  // iMessage hides og:description unless the page reads as a social post.
  // og:type=article plus an ActivityPub alternate link opts into that layout,
  // which shows the description AND pairs the icon with the og:image thumbnail.
  if (isIMessage(userAgent)) {
    tags.push(`<meta property="og:type" content="article" />`);
    tags.push(`<link rel="alternate" type="application/activity+json" href="" />`);
  }

  // Large-card layout on Twitter/X (and platforms that key off twitter:card).
  tags.push(`<meta name="twitter:card" content="summary_large_image" />`);
  for (const key of ["title", "description", "image"]) {
    const value = metadata[`og:${key}`];
    if (value) tags.push(`<meta name="twitter:${key}" content="${escapeHtml(value)}" />`);
  }

  // Everything registered by the caller, emitted verbatim as og:* tags.
  const emitted = new Set(["og:site_name", "og:url"]);
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || value === null || emitted.has(key)) continue;
    tags.push(`<meta property="${escapeHtml(key)}" content="${escapeHtml(value)}" />`);
  }

  // Icon + thumbnail combo: the small icon renders alongside the large og:image.
  if (iconUrl) {
    tags.push(`<link rel="icon" href="${escapeHtml(iconUrl)}" />`);
    tags.push(`<link rel="apple-touch-icon" href="${escapeHtml(iconUrl)}" />`);
  }

  // Humans without JS still get forwarded.
  tags.push(`<meta http-equiv="refresh" content="0;url=${escapeHtml(forwardingUrl)}" />`);
  return tags.join("\n  ");
}

const buildSharePage = (metadata, requestUrl, forwardingUrl, iconUrl, userAgent) => `<!DOCTYPE html>
<html>
<head>
  ${buildMetaTags(metadata, requestUrl, forwardingUrl, iconUrl, userAgent)}
</head>
<body>
  <script>window.location.replace(${JSON.stringify(forwardingUrl).replace(/</g, "\\u003c")})</script>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Validation: this data lands in HTML we serve — constrain it at write time.

const ALLOWED_KEYS = new Set([
  "og:title", "og:description", "og:type",
  "og:image", "og:image:width", "og:image:height",
  "og:video", "og:video:type", "og:video:width", "og:video:height",
]);

function validate(body) {
  const { forwardingUrl, metadata, iconUrl } = body ?? {};
  if (typeof forwardingUrl !== "string" || !forwardingUrl.startsWith("/"))
    return "forwardingUrl must be a path starting with '/'"; // never an open redirect
  if (!metadata || typeof metadata["og:title"] !== "string" || !metadata["og:title"].length)
    return "metadata['og:title'] is required";
  for (const key of Object.keys(metadata))
    if (!ALLOWED_KEYS.has(key)) return `unsupported metadata key: ${key}`;
  if (iconUrl !== undefined && typeof iconUrl !== "string")
    return "iconUrl must be a string";
  return null;
}

// ---------------------------------------------------------------------------
// Routes

async function handleRegister(request) {
  const body = await request.json().catch(() => null);
  const error = validate(body);
  if (error) return Response.json({ error }, { status: 400 });

  const id = put({
    forwardingUrl: body.forwardingUrl,
    metadata: body.metadata,
    iconUrl: body.iconUrl,
    views: 0,
  });
  return Response.json({ id, shareUrl: `${ORIGIN}/s/${id}` });
}

function handleShare(request, id) {
  const record = store.get(id);
  if (!record) return new Response("Not found", { status: 404 });

  const userAgent = request.headers.get("user-agent") ?? "";
  if (!isBot(userAgent)) record.views += 1; // crawler hits aren't human views

  const html = buildSharePage(
    record.metadata,
    `${ORIGIN}/s/${id}`,
    new URL(record.forwardingUrl, ORIGIN).href,
    record.iconUrl,
    userAgent,
  );
  return new Response(html, {
    headers: {
      "content-type": "text/html",
      // Let a CDN absorb crawler bursts, but keep corrections propagating
      "cache-control": "public, max-age=300, s-maxage=300",
    },
  });
}

async function fetchHandler(request) {
  const url = new URL(request.url);
  if (request.method === "POST" && url.pathname === "/social-metadata")
    return handleRegister(request);
  const shareMatch = url.pathname.match(/^\/s\/([\w-]+)$/);
  if (request.method === "GET" && shareMatch)
    return handleShare(request, shareMatch[1]);
  return new Response("Not found", { status: 404 });
}

export default { fetch: fetchHandler, port: 3000 };
