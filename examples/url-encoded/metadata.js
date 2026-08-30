// Stateless link previews: the metadata lives in the URL path itself.
//
//   /{title}/{key}/{value}/{key}/{value}/…/
//
//   /Launch--Day/d/We-shipped-it/i/:cdn.example.com%2Fhero.png/f/🚀/u/:example.com/
//
// Keys: d description · i image (+iw/ih) · v video (+vw/vh) · u forward URL
//       f favicon (URL or bare emoji) · s site name · y og:type · c theme color hex
//
// Pretty title/description encoding: '-' → space, '--' → '-', '---' → ' - '.
// URL values: ':' prefix means https://; otherwise percent-encoded or base64.
//
// Deploy as an edge function in front of a static site; it only intercepts
// crawler requests, so humans fall through to the real pages.

const BOTS = [
  "Twitterbot", "facebookexternalhit", "Slackbot-LinkExpanding",
  "Discordbot", "WhatsApp", "TelegramBot", "Snapchat", "Googlebot", "curl",
];

const escapeHtml = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const decodePretty = (s) => {
  const replacements = { "---": " - ", "--": "-", "-": " " };
  return decodeURIComponent(s.replace(/-+/g, (m) => replacements[m] ?? "-"));
};

function decodeUrlValue(s) {
  const value = decodeURIComponent(s);
  if (value.startsWith(":")) return `https://${value.slice(1)}`;
  if (/^https?:|^[./]/.test(value)) return value;
  try {
    return atob(value.replace(/=/g, ""));
  } catch {
    return value;
  }
}

const URL_KEYS = new Set(["u", "i", "v", "f"]);

function pathToMetadata(path) {
  const components = path.slice(1).split("/");
  components.unshift("t"); // first segment is the title
  const info = {};
  for (let i = 0; i < components.length; i += 2) {
    const key = components[i];
    const raw = components[i + 1];
    if (!key || !raw) continue;
    info[key] = URL_KEYS.has(key) ? decodeUrlValue(raw) : decodePretty(raw);
  }
  return info;
}

const prop = (p, content) => `<meta property="${p}" content="${escapeHtml(content)}"/>`;
const name = (n, content) => `<meta name="${n}" content="${escapeHtml(content)}"/>`;

// Any emoji becomes a favicon via Google's Noto emoji PNG CDN.
function faviconTag(value) {
  if (value.length > 9) {
    return `<link rel="icon" type="image/png" href="${escapeHtml(value)}">`;
  }
  const codepoints = Array.from(value).map((c) => c.codePointAt(0).toString(16));
  const href = `https://fonts.gstatic.com/s/e/notoemoji/14.0/${codepoints.join("_")}/128.png`;
  return `<link rel="icon" type="image/png" href="${href}">`;
}

export default async (request) => {
  const ua = request.headers.get("user-agent") ?? "";
  const path = new URL(request.url).pathname;

  const isCrawler = BOTS.some((bot) => ua.includes(bot));
  if (path === "/" || !path.endsWith("/") || !isCrawler) return; // fall through to static site

  const info = pathToMetadata(path);
  const tags = [`<meta charset="UTF-8">`];

  if (info.t) tags.push(`<title>${escapeHtml(info.t)}</title>`, prop("og:title", info.t));
  if (info.s) tags.push(prop("og:site_name", info.s));
  if (info.y) tags.push(prop("og:type", info.y));
  if (info.d) tags.push(prop("og:description", info.d), name("description", info.d));
  if (info.c) tags.push(name("theme-color", `#${info.c}`));

  if (info.u) {
    tags.push(prop("og:url", info.u));
    tags.push(`<meta http-equiv="refresh" content="0;url=${escapeHtml(info.u)}" />`);
  }
  if (info.i) {
    // Relative images resolve against the forwarding URL
    const image = /^[./]/.test(info.i) && info.u ? new URL(info.i, info.u).href : info.i;
    tags.push(prop("og:image", image));
    if (info.iw) tags.push(prop("og:image:width", info.iw));
    if (info.ih) tags.push(prop("og:image:height", info.ih));
    tags.push(name("twitter:card", "summary_large_image"));
  }
  if (info.v) {
    tags.push(prop("og:video", info.v));
    if (info.vw) tags.push(prop("og:video:width", info.vw));
    if (info.vh) tags.push(prop("og:video:height", info.vh));
  }
  if (info.f) tags.push(faviconTag(info.f));

  return new Response(tags.join("\n"), {
    headers: { "content-type": "text/html" },
  });
};
