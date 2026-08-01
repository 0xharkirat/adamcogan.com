/**
 * Turn the raw WordPress comment export into a threaded, sanitised archive
 * keyed by post slug.
 *
 * These are read-only history. 154 different people wrote them between 2011 and
 * 2026, and no comment host can reproduce that authorship, so they are stored
 * as content with their original names and dates rather than being imported
 * into a service that would re-attribute all of them to one account.
 */

/**
 * Comment bodies are third-party HTML, so they are a trust boundary. They are
 * reduced to a small inline-only tag set at migration time, once, rather than
 * being sanitised on every render or trusted because WordPress already
 * moderated them.
 */
const ALLOWED_TAGS = new Set(["p", "br", "em", "i", "strong", "b", "code", "pre", "blockquote", "ul", "ol", "li", "a"]);

export function sanitise(html) {
  let out = String(html ?? "");

  // Drop dangerous elements wholesale, including their content.
  out = out.replace(/<(script|style|iframe|object|embed|form|input|svg)\b[\s\S]*?<\/\1>/gi, "");
  out = out.replace(/<(script|style|iframe|object|embed|form|input|svg)\b[^>]*\/?>/gi, "");

  out = out.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (tag, name, attrs) => {
    const lower = name.toLowerCase();
    if (!ALLOWED_TAGS.has(lower)) return "";
    if (tag.startsWith("</")) return `</${lower}>`;

    // Only href survives, and only when it is a plain http(s) link. This is
    // what stops javascript: URLs and every on* handler.
    if (lower === "a") {
      const href = attrs.match(/\bhref\s*=\s*"([^"]*)"/i)?.[1] ?? "";
      if (!/^https?:\/\//i.test(href)) return "<a>";
      const safe = href.replace(/"/g, "&quot;");
      return `<a href="${safe}" rel="nofollow ugc noopener" target="_blank">`;
    }
    return `<${lower}>`;
  });

  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/** Author-supplied URLs are shown as a link on the name, same rules as above. */
function safeUrl(url) {
  return /^https?:\/\//i.test(String(url ?? "")) ? url : null;
}

/**
 * Group comments by post slug and nest replies under their parent.
 *
 * `date` is used rather than `date_gmt` for the same reason as posts: the GMT
 * field is not reliably populated on this site.
 */
export function buildArchive(comments, posts, pages = []) {
  // Pages are included because the Tesla page carries a comment too, and
  // keying on posts alone silently dropped it.
  const slugById = new Map([...posts, ...pages].map((p) => [p.id, p.slug]));
  const byId = new Map();

  for (const c of comments) {
    if (c.status !== "approved") continue;
    const slug = slugById.get(c.post);
    if (!slug) continue; // comment on content that was not migrated
    byId.set(c.id, {
      id: c.id,
      slug,
      parent: c.parent || 0,
      author: c.author_name || "Anonymous",
      authorUrl: safeUrl(c.author_url),
      date: `${c.date}Z`,
      html: sanitise(c.content?.rendered),
      replies: [],
    });
  }

  const archive = {};
  const orphaned = [];

  for (const comment of byId.values()) {
    if (comment.parent && byId.has(comment.parent)) {
      byId.get(comment.parent).replies.push(comment);
      continue;
    }
    // A reply whose parent was not approved is promoted to top level rather
    // than dropped, so no one's words disappear.
    if (comment.parent) orphaned.push(comment.id);
    (archive[comment.slug] ??= []).push(comment);
  }

  const strip = ({ slug, parent, ...rest }) => ({ ...rest, replies: rest.replies.map(strip) });
  for (const slug of Object.keys(archive)) {
    archive[slug] = archive[slug]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(strip);
  }

  return { archive, total: byId.size, posts: Object.keys(archive).length, orphaned };
}

/** Total including nested replies, for the "N Comments" count in the meta line. */
export function countAll(list) {
  return list.reduce((n, c) => n + 1 + countAll(c.replies ?? []), 0);
}
