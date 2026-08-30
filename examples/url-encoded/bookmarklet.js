// Bookmarklet: wrap the current page in a url-encoded preview link.
// Scrapes the page's own OG tags (falling back to <title>, location, and the
// largest favicon) and builds a /{title}/key/value/…/ path for the edge
// function in metadata.js. Useful for re-sharing pages with broken or missing
// previews — or for giving a preview to something that can't carry one.
//
// Minify and wrap in javascript:(()=>{…})() to install.

(() => {
  const og = (p) => document.querySelector(`meta[property="${p}"]`)?.content;

  const largestIcon = [...document.querySelectorAll('link[rel~="icon"]')]
    .sort(
      (a, b) =>
        parseInt(b.getAttribute("sizes")?.split("x")[0] ?? 0) -
        parseInt(a.getAttribute("sizes")?.split("x")[0] ?? 0),
    )[0]?.href;

  const encodePretty = (s) =>
    encodeURIComponent(s.trim().replace(/ - /g, "---").replace(/-/g, "--").replace(/ /g, "-"));
  const encodeUrl = (u) => encodeURIComponent(u.replace(/^https:\/\//, ":"));

  const data = {
    d: og("og:description"),
    i: og("og:image"),
    f: largestIcon,
    u: og("og:url") || location.href,
  };

  const URL_KEYS = ["i", "f", "u"];
  const segments = [encodePretty(og("og:title") || document.title)];
  for (const [key, value] of Object.entries(data)) {
    if (!value) continue;
    segments.push(key, URL_KEYS.includes(key) ? encodeUrl(value) : encodePretty(value));
  }

  const url = `https://example.app/${segments.join("/")}/`;
  prompt("Preview link:", url);
})();
