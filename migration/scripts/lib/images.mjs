/**
 * Shared media URL mapping. Used by both the transform (rewrites paths in MDX)
 * and the downloader (fetches the bytes), so the two can never disagree.
 *
 * Covers more than images: posts also link to PDFs under wp-content/uploads,
 * and those have to come with us or the new site still depends on the old host.
 */

/** Hosts whose media we pull into the repo. Anything else stays hotlinked. */
const OWNED_HOSTS = new Set(["adamcogan.com", "www.adamcogan.com"]);

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i;

/**
 * WordPress emits resized variants like `foo-300x159.png` alongside the
 * original `foo.png`. Posts almost always reference a variant, so we upgrade to
 * the original. Only images have variants, and the downloader verifies the
 * original really exists and falls back to the referenced URL when it does not.
 */
export function stripSizeSuffix(pathname) {
  if (!IMAGE_EXT.test(pathname)) return pathname;
  return pathname.replace(/-\d+x\d+(?=\.[a-z0-9]+$)/i, "");
}

export function parse(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl, "https://adamcogan.com");
  } catch {
    return null;
  }
  if (!OWNED_HOSTS.has(url.host)) return null;

  const m = decodeURI(url.pathname).match(/^\/wp-content\/uploads\/(.+)$/);
  if (!m) return null;

  const original = stripSizeSuffix(m[1]);
  return {
    /** URL to try first (full-size original). */
    originalUrl: encodeURI(`https://adamcogan.com/wp-content/uploads/${original}`),
    /** URL exactly as referenced in the post, used as download fallback. */
    referencedUrl: encodeURI(url.origin + decodeURI(url.pathname)),
    /** Path the site serves it from. */
    localPath: encodeURI(`/media/${original}`),
    /** Path on disk, relative to public/. */
    diskPath: `media/${original}`,
    isImage: IMAGE_EXT.test(original),
    wasResized: original !== m[1],
  };
}

/** Rewrite a single media URL to its local path, or return it unchanged. */
export function toLocal(rawUrl) {
  return parse(rawUrl)?.localPath ?? rawUrl;
}
