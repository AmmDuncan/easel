/**
 * Inline remote images into pushed HTML so exports work.
 *
 * Cross-origin images (e.g. mobbin screenshots) render on screen but can't be
 * rasterised client-side: fetching them for inlining is CORS-blocked, and
 * drawing a cross-origin image taints the canvas so PNG/PDF export throws. We
 * fetch them server-side (no CORS) at push time and rewrite the references to
 * self-contained `data:` URLs, so the stored push exports cleanly and survives
 * the original URL later expiring.
 *
 * A remote URL that can't be inlined (timeout, non-image, too large, network
 * error) is left untouched — it still displays cross-origin, it just won't
 * appear in an export — so a dead link degrades gracefully instead of failing
 * the push. Only `http(s)` URLs are touched; `data:`, `blob:`, and relative
 * references are left alone.
 */

const PER_IMAGE_TIMEOUT_MS = 8000;
const MAX_IMAGE_BYTES = 8_000_000;

export interface InlineResult {
  html: string;
  inlined: number;
  failed: { url: string; reason: string }[];
}

// `src="https://…"` (img/source/…) and CSS `url(https://…)` with optional quotes.
// Capture group 2 is the URL in both.
const URL_PATTERNS: readonly RegExp[] = [
  /\bsrc\s*=\s*(["'])(https?:\/\/[^"']+?)\1/gi,
  /url\(\s*(["']?)(https?:\/\/[^)"']+?)\1\s*\)/gi,
];

function collectRemoteUrls(html: string): string[] {
  const urls = new Set<string>();
  for (const pattern of URL_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(html)) !== null) {
      urls.add(match[2]);
    }
  }
  return [...urls];
}

async function fetchAsDataUri(url: string, fetchImpl: typeof fetch): Promise<string> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), PER_IMAGE_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: ac.signal, redirect: "follow" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const type = (res.headers.get("content-type") || "").split(";")[0].trim();
    if (!type.startsWith("image/")) {
      throw new Error(`not an image (${type || "unknown content-type"})`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(`too large (${buf.byteLength} bytes)`);
    }
    return `data:${type};base64,${buf.toString("base64")}`;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch every remote image referenced in `html` and rewrite the references to
 * `data:` URIs. Fetches run in parallel, each bounded by its own timeout, so
 * total latency is roughly the slowest single image, not the sum.
 *
 * @param fetchImpl - injectable for tests; defaults to global `fetch`.
 */
export async function inlineRemoteImages(
  html: string,
  fetchImpl: typeof fetch = fetch,
): Promise<InlineResult> {
  const urls = collectRemoteUrls(html);
  if (urls.length === 0) {
    return { html, inlined: 0, failed: [] };
  }

  const dataUriByUrl = new Map<string, string>();
  const failed: { url: string; reason: string }[] = [];
  await Promise.all(
    urls.map(async (url) => {
      try {
        dataUriByUrl.set(url, await fetchAsDataUri(url, fetchImpl));
      } catch (err) {
        failed.push({ url, reason: err instanceof Error ? err.message : String(err) });
      }
    }),
  );

  // Swap each URL inside its matched attribute/url() context only, so a URL
  // that is a prefix of another can't be corrupted by a blind global replace.
  let out = html;
  for (const pattern of URL_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    out = out.replace(re, (full, _quote, url) => {
      const dataUri = dataUriByUrl.get(url);
      return dataUri ? full.replace(url, dataUri) : full;
    });
  }

  return { html: out, inlined: dataUriByUrl.size, failed };
}
