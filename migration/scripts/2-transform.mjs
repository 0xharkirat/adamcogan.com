/**
 * Phase 2: turn the raw WordPress HTML into MDX files Tina can edit.
 *
 * Deterministic on purpose. 183 posts through an LLM would be slow,
 * non-reproducible, and would risk paraphrasing Adam's actual words; turndown
 * with rules tuned to this site's markup is exact and re-runnable.
 *
 * MDX is NOT HTML: the body is parsed as JSX, so `class=`, unclosed `<p>`, and
 * bare `{`/`<` would all break the build. Every rule below therefore emits real
 * Markdown or a registered MDX component, never passthrough HTML.
 */
import { readFile, readdir, writeFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { toLocal } from "./lib/images.mjs";
import { buildArchive, countAll } from "./lib/comments.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RAW = join(ROOT, "migration", "raw");
const readRaw = async (n) => JSON.parse(await readFile(join(RAW, `${n}.json`), "utf8"));

const [posts, pages, categories, tags, users, media] = await Promise.all(
  ["posts", "pages", "categories", "tags", "users", "media"].map(readRaw),
);

const catById = new Map(categories.map((c) => [c.id, c]));
const tagById = new Map(tags.map((t) => [t.id, t]));
const userById = new Map(users.map((u) => [u.id, u]));
const mediaById = new Map(media.map((m) => [m.id, m]));

/* ---------------------------------------------------------------- helpers */

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…",
  mdash: "-", ndash: "-", lsquo: "‘", rsquo: "’", ldquo: "“",
  rdquo: "”", laquo: "«", raquo: "»", trade: "™", copy: "©", reg: "®",
  deg: "°", eacute: "é", middot: "·", bull: "•", prime: "′", Prime: "″",
};

/** WP double-encodes freely; decode numeric and the named entities it emits. */
function decodeEntities(s) {
  return String(s ?? "")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name] ?? ENTITIES[name.toLowerCase()] ?? m);
}

/**
 * Tags become a space, not nothing. Captions contain `<br>` and `<strong>`
 * between words, so removing tags outright glues them together:
 * "SSW Hangzhou<br>New Office Tour" became "HangzhouNew".
 */
function stripTags(html) {
  return decodeEntities(String(html ?? "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Escape a value going into an MDX attribute string. */
function attr(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, "&quot;").replace(/\n+/g, " ").trim();
}

/** Quote a YAML scalar safely rather than guessing when it needs quoting. */
function yaml(value) {
  return JSON.stringify(String(value ?? ""));
}

function youtubeId(src) {
  const m = String(src).match(/(?:youtube(?:-nocookie)?\.com\/(?:embed|v)\/|youtu\.be\/|[?&]v=)([\w-]{11})/);
  return m ? m[1] : null;
}

/** Domino's NodeList is array-like but not iterable, so spread would throw. */
function all(node, selector) {
  return node?.querySelectorAll ? Array.prototype.slice.call(node.querySelectorAll(selector)) : [];
}

/* -------------------------------------------------------------- turndown */

const td = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "_",
  strongDelimiter: "**",
  hr: "---",
  linkStyle: "inlined",
});
td.use(gfm);

// Theme chrome and tracking, not content.
td.remove(["script", "style", "noscript"]);

/**
 * YouTube embeds -> the starter's existing YouTubeEmbed component.
 * Matches on the iframe rather than the figure class so the 2011-era embeds
 * (bare <iframe>, no wp-block wrapper) are caught by the same rule.
 */
td.addRule("youtube", {
  // FIGURE only. This rule replaces the whole matched element with the embed,
  // so matching any ancestor that merely CONTAINS an iframe destroys
  // everything else inside it: a wrapper div holding an embed plus the rest of
  // the article silently collapsed to just the video, costing one post 88% of
  // its words. A <figure> is a self-contained embed unit, so it is safe; every
  // other position is handled by `bareYoutubeIframe` below, which replaces
  // only the iframe and leaves its siblings alone.
  filter: (node) =>
    node.nodeName === "FIGURE" &&
    node.querySelector?.("iframe") &&
    youtubeId(node.querySelector("iframe").getAttribute("src") || ""),
  replacement: (_content, node) => {
    const id = youtubeId(node.querySelector("iframe").getAttribute("src") || "");
    // 63 video embeds carry a figcaption. Without this they would be dropped.
    const cap = node.querySelector("figcaption");
    const caption = cap ? attr(stripTags(cap.innerHTML)) : "";
    return `\n\n<YouTubeEmbed videoId="${id}"${caption ? ` caption="${caption}"` : ""} />\n\n`;
  },
});

td.addRule("bareYoutubeIframe", {
  filter: (node) => node.nodeName === "IFRAME" && youtubeId(node.getAttribute("src") || ""),
  replacement: (_c, node) => `\n\n<YouTubeEmbed videoId="${youtubeId(node.getAttribute("src"))}" />\n\n`,
});

/**
 * Non-YouTube iframes (LinkedIn, Facebook) degrade to a plain link.
 *
 * The YouTube guard is load-bearing: turndown gives later-registered rules
 * higher precedence, so without it this rule outranks `bareYoutubeIframe` and
 * turns every video into "View embedded content".
 */
td.addRule("otherIframe", {
  filter: (node) => node.nodeName === "IFRAME" && !youtubeId(node.getAttribute("src") || ""),
  replacement: (_c, node) => {
    const src = node.getAttribute("src");
    if (!src) return "";
    const url = src.startsWith("//") ? `https:${src}` : src;
    return `\n\n[View embedded content](${url})\n\n`;
  },
});

/**
 * Figures with captions -> <Figure />. All 713 captions on this site are
 * non-empty and follow Adam's "Figure: ..." convention, so they are content and
 * must not be flattened into alt text.
 */
td.addRule("figureWithCaption", {
  filter: (node) => node.nodeName === "FIGURE" && node.querySelector?.("img") && node.querySelector?.("figcaption"),
  replacement: (_content, node) => {
    const img = node.querySelector("img");
    const caption = stripTags(node.querySelector("figcaption").innerHTML);
    const link = node.querySelector("a")?.getAttribute("href");
    const src = toLocal(bestSrc(img, link));
    const alt = stripTags(img.getAttribute("alt") || "");
    return `\n\n<Figure src="${attr(src)}" alt="${attr(alt)}" caption="${attr(caption)}" />\n\n`;
  },
});

/**
 * Figures without captions collapse to a plain Markdown image.
 * The `!figcaption` guard is load-bearing: turndown gives later-registered
 * rules higher precedence, so without it this rule swallows captioned figures
 * before `figureWithCaption` is ever consulted.
 */
td.addRule("figureImage", {
  filter: (node) =>
    node.nodeName === "FIGURE" && node.querySelector?.("img") && !node.querySelector?.("figcaption"),
  replacement: (_content, node) => {
    const img = node.querySelector("img");
    const link = node.querySelector("a")?.getAttribute("href");
    const src = toLocal(bestSrc(img, link));
    return `\n\n![${attr(stripTags(img.getAttribute("alt") || ""))}](${src})\n\n`;
  },
});

/** Five posts embed an mp4/mov uploaded straight to the media library. */
td.addRule("video", {
  filter: (node) =>
    node.nodeName === "VIDEO" || (node.nodeName === "FIGURE" && node.querySelector?.("video")),
  replacement: (_c, node) => {
    const video = node.nodeName === "VIDEO" ? node : node.querySelector("video");
    const src = video.getAttribute("src") || video.querySelector?.("source")?.getAttribute("src") || "";
    if (!src) return "";
    const cap = node.querySelector?.("figcaption");
    const caption = cap ? attr(stripTags(cap.innerHTML)) : "";
    return `\n\n<Video src="${attr(toLocal(src))}"${caption ? ` caption="${caption}"` : ""} />\n\n`;
  },
});

td.addRule("image", {
  filter: "img",
  replacement: (_c, node) => {
    const src = toLocal(bestSrc(node, null));
    if (!src) return "";
    return `![${attr(stripTags(node.getAttribute("alt") || ""))}](${src})`;
  },
});

/**
 * Table cells are converted by a separate service instance: turndown is not
 * reentrant, so calling `td.turndown()` from inside one of `td`'s own rules
 * corrupts the in-progress conversion.
 */
const cellTd = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", emDelimiter: "_" });
cellTd.remove(["script", "style", "noscript"]);

function inlineCell(html) {
  return cellTd
    .turndown(html)
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\|/g, "\\|")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Prefer the full-size original: 374 images are wrapped in an <a> pointing at
 * it, and 293 <img src> values are resized variants like `foo-300x159.png`.
 */
function bestSrc(img, linkHref) {
  if (linkHref && /wp-content\/uploads\/.+\.(png|jpe?g|gif|webp|svg)$/i.test(linkHref)) return linkHref;
  return img.getAttribute("src") || "";
}

/**
 * Tables. The GFM plugin bails on this site's tables (none have a heading row,
 * and the 2012-era ones have unclosed <p> inside <td>) and passes the raw HTML
 * straight through, which would break the MDX build. So we build the table
 * ourselves and tolerate whatever the DOM recovered.
 *
 * ponytail: multi-block cells are flattened to one line joined by spaces,
 * because GFM cells cannot hold block content. Affects 14 tables in 11 posts.
 * If a cell ever needs real structure, promote it to an MDX table component.
 */
td.addRule("table", {
  filter: (node) =>
    node.nodeName === "TABLE" || (node.nodeName === "FIGURE" && node.querySelector?.("table")),
  replacement: (_content, node) => {
    // A wp-block-table figure carries the caption outside the <table>, so match
    // the figure too and keep the caption attached.
    const isFigure = node.nodeName === "FIGURE";
    const cap = isFigure ? node.querySelector("figcaption") : null;
    const caption = cap ? stripTags(cap.innerHTML) : "";
    node = isFigure ? node.querySelector("table") : node;
    const trs = all(node, "tr");
    const rows = trs.map((tr) => all(tr, "th,td").map((cell) => inlineCell(cell.innerHTML || "")));
    if (!rows.length) return "";

    const width = Math.max(...rows.map((r) => r.length));
    const pad = (r) => [...r, ...Array(width - r.length).fill("")];

    // GFM needs a header row. Use the first row only when it actually reads as
    // one (all cells <th>, or all bold); otherwise emit an empty header.
    const firstCells = all(trs[0], "th,td");
    const isHeader =
      firstCells.length > 0 &&
      firstCells.every((c) => c.nodeName === "TH" || /^\s*<(b|strong)\b/i.test((c.innerHTML || "").trim()));

    const header = isHeader ? pad(rows.shift()).map((c) => c.replace(/\*\*/g, "")) : Array(width).fill("");
    const line = `| ${header.join(" | ")} |\n| ${Array(width).fill("---").join(" | ")} |`;
    const body = rows.map((r) => `| ${pad(r).join(" | ")} |`).join("\n");
    const tail = caption ? `\n\n_${caption.replace(/_/g, "\\_")}_` : "";
    return `\n\n${line}\n${body.trim() ? body : ""}${tail}\n\n`;
  },
});

/** Empty paragraphs (WP leaves many behind) produce stray blank lines. */
td.addRule("emptyParagraph", {
  filter: (node) => node.nodeName === "P" && !node.querySelector?.("img,iframe") && !stripTags(node.innerHTML),
  replacement: () => "",
});

/* ------------------------------------------------------------- transform */

const stats = { youtube: 0, figures: 0, images: 0, tables: 0, codeBlocks: 0, curlyEscaped: 0 };

function toMdx(html) {
  const cleaned = String(html ?? "")
    // Empty builder div injected into all 183 posts by the Themify theme.
    .replace(/<!--themify_builder_content-->[\s\S]*?<!--\/themify_builder_content-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");

  stats.youtube += (cleaned.match(/youtube(?:-nocookie)?\.com\/embed|youtu\.be\//g) || []).length;
  stats.figures += (cleaned.match(/<figcaption/gi) || []).length;
  stats.tables += (cleaned.match(/<table/gi) || []).length;
  stats.codeBlocks += (cleaned.match(/<pre/gi) || []).length;

  let md = td.turndown(cleaned);

  // MDX reads `{` as the start of a JS expression and `<` as a tag. Escape any
  // that survive in prose, but never touch fenced code or our own components.
  // The sentinel uses NUL because it cannot occur in the source HTML; a
  // space-delimited marker would collide with ordinary text like "in 5 minutes".
  const guarded = [];
  md = md.replace(/\`\`\`[\s\S]*?\`\`\`|\`[^\`\n]*\`|<(?:YouTubeEmbed|Figure)\b[^>]*\/>/g, (m) => {
    guarded.push(m);
    return `\u0000${guarded.length - 1}\u0000`;
  });
  md = md.replace(/[{}]/g, (m) => {
    stats.curlyEscaped += 1;
    return `\\${m}`;
  });
  md = md.replace(/<(?![a-zA-Z\/!])/g, "\\<");
  md = md.replace(/\u0000(\d+)\u0000/g, (_, i) => guarded[Number(i)]);

  // Links to uploads (PDFs, and full-size images opened from a thumbnail) are
  // assets too: rewrite them so nothing still points at the WordPress host.
  // The trailing group allows a Markdown link title: [x](url "Click to view").
  md = md.replace(
    /\]\((https?:\/\/(?:www\.)?adamcogan\.com\/wp-content\/uploads\/[^)\s]+)(\s+"[^"]*")?\)/gi,
    (m, url, title = "") => {
      const local = toLocal(url);
      return local === url ? m : `](${local}${title})`;
    },
  );

  return md
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Post dates are WALL-CLOCK, not instants, and that is a deliberate call.
 *
 * WordPress exposes `date` (site local) and `date_gmt` (UTC). On this site
 * `date_gmt` is unusable: it is identical to `date` for 158 of 183 posts,
 * meaning no real GMT was ever computed, while the other 25 carry a true +10h
 * offset. Treating it as UTC moves posts across day boundaries in both
 * directions and breaks their permalinks.
 *
 * `date` matches the WordPress permalink for all 183 posts, so it is the only
 * source of truth. We take that local wall clock and pin it to UTC, so reading
 * the parts back with getUTC* reproduces exactly the date WordPress published
 * under. The absolute instant is then off by the Sydney offset, which nothing
 * depends on, and that is a better trade than false precision that corrupts
 * URLs.
 */
const wallClock = (naive) => new Date(`${naive}Z`);

function frontmatter(item, kind) {
  const date = wallClock(item.date);
  const modified = wallClock(item.modified);
  const hero = mediaById.get(item.featured_media);
  const author = userById.get(item.author);

  const cats = (item.categories || []).map((id) => catById.get(id)?.slug).filter(Boolean);
  const tagSlugs = (item.tags || []).map((id) => tagById.get(id)?.slug).filter(Boolean);
  const legacyPath = new URL(item.link).pathname;

  const lines = [
    `title: ${yaml(decodeEntities(item.title.rendered))}`,
    `description: ${yaml(stripTags(item.excerpt.rendered).replace(/\s*\[…\]\s*$/, "").slice(0, 300))}`,
    `pubDate: ${date.toISOString()}`,
  ];
  if (modified > date) lines.push(`updatedDate: ${modified.toISOString()}`);
  if (hero?.source_url) lines.push(`heroImage: ${yaml(toLocal(hero.source_url))}`);
  if (author) lines.push(`author: ${yaml(author.name)}`);
  if (kind === "post") {
    lines.push(`categories: [${cats.map(yaml).join(", ")}]`);
    lines.push(`tags: [${tagSlugs.map(yaml).join(", ")}]`);
  }
  lines.push(`legacyUrl: ${yaml(legacyPath)}`);
  lines.push(`wpId: ${item.id}`);

  return `---\n${lines.join("\n")}\n---\n`;
}

async function emit(items, kind, outDir) {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const written = [];
  for (const item of items) {
    const body = toMdx(item.content.rendered);
    stats.images += (body.match(/!\[|<Figure /g) || []).length;
    await writeFile(join(outDir, `${item.slug}.mdx`), `${frontmatter(item, kind)}\n${body}\n`);
    written.push({ slug: item.slug, legacyUrl: new URL(item.link).pathname, wpId: item.id, bytes: body.length });
  }
  console.log(`${kind}: wrote ${written.length} files to ${outDir.replace(ROOT + "/", "")}`);
  return written;
}

const writtenPosts = await emit(posts, "post", join(ROOT, "src", "content", "blog"));
const writtenPages = await emit(pages, "page", join(ROOT, "src", "content", "page"));

/**
 * Re-apply the media renames from the optimise pass.
 *
 * This script emits the extensions WordPress used (.jpg/.png/.mov), but
 * `4-optimise-media.mjs` converted those files to .webp/.mp4. Without this,
 * re-running the transform silently points every image at a file that was
 * deleted, so the two stay in step regardless of the order they are run in.
 */
async function relinkOptimisedMedia() {
  let report;
  try {
    report = JSON.parse(await readFile(join(RAW, "_optimise-report.json"), "utf8"));
  } catch {
    return; // optimise pass has not run yet
  }

  const map = new Map(
    report.filter((r) => r.renamedFrom).map((r) => [decodeURI(r.renamedFrom), r.renamedTo]),
  );
  if (!map.size) return;

  const reencode = (p) => p.split("/").map(encodeURIComponent).join("/");
  let touched = 0;
  for (const dir of [join(ROOT, "src", "content", "blog"), join(ROOT, "src", "content", "page")]) {
    for (const name of await readdir(dir)) {
      if (!name.endsWith(".mdx")) continue;
      const path = join(dir, name);
      const original = await readFile(path, "utf8");
      const updated = original.replace(/\/media\/[^\s"')\]]+/g, (m) => {
        const target = map.get(decodeURI(m));
        if (!target) return m;
        return m === decodeURI(m) ? target : reencode(target);
      });
      if (updated !== original) {
        await writeFile(path, updated);
        touched += 1;
      }
    }
  }
  console.log(`Relinked optimised media in ${touched} files (${map.size} known renames).`);
}

await relinkOptimisedMedia();

/* Comment archive: read-only history, kept out of the MDX so Tina does not
   present other people's words as editable post content. */
let commentSummary = { total: 0, posts: 0, orphaned: [] };
try {
  const rawComments = JSON.parse(await readFile(join(RAW, "comments.json"), "utf8"));
  const { archive, total, posts: withComments, orphaned } = buildArchive(rawComments, posts, pages);
  commentSummary = { total, posts: withComments, orphaned };

  const dropped = rawComments.filter((c) => c.status === "approved").length - total;
  if (dropped > 0) console.warn(`WARNING: ${dropped} approved comment(s) had no matching post or page.`);

  await mkdir(join(ROOT, "src", "data"), { recursive: true });
  await writeFile(
    join(ROOT, "src", "data", "comments.json"),
    JSON.stringify(
      Object.fromEntries(Object.entries(archive).sort(([a], [b]) => a.localeCompare(b))),
      null,
      2,
    ),
  );
  console.log(
    `comments: ${total} across ${withComments} posts` +
      (orphaned.length ? `, ${orphaned.length} reply(s) promoted to top level` : ""),
  );
} catch (err) {
  if (err.code !== "ENOENT") throw err;
  console.warn("comments: raw/comments.json not found, skipping (run 1-extract.mjs)");
}

// Taxonomy lookup: frontmatter stores WP slugs so archive URLs stay identical
// to the old site; this maps them back to display names for the UI.
await mkdir(join(ROOT, "src", "data"), { recursive: true });
await writeFile(
  join(ROOT, "src", "data", "taxonomy.json"),
  JSON.stringify(
    {
      categories: Object.fromEntries(
        categories.map((c) => [c.slug, { name: decodeEntities(c.name), count: c.count, description: stripTags(c.description) }]),
      ),
      tags: Object.fromEntries(tags.map((t) => [t.slug, { name: decodeEntities(t.name), count: t.count }])),
      authors: Object.fromEntries(users.map((u) => [u.slug, { name: u.name, description: stripTags(u.description) }])),
    },
    null,
    2,
  ),
);

const empty = writtenPosts.filter((p) => p.bytes < 40);
console.log(
  `\nContent: ${stats.youtube} youtube embeds, ${stats.figures} captioned figures, ` +
    `${stats.images} images, ${stats.tables} tables, ${stats.codeBlocks} code blocks, ` +
    `${stats.curlyEscaped} curly braces escaped.`,
);
if (empty.length) console.warn(`WARNING: ${empty.length} suspiciously short bodies: ${empty.map((e) => e.slug).join(", ")}`);
await writeFile(join(RAW, "_written.json"), JSON.stringify({ posts: writtenPosts, pages: writtenPages }, null, 2));
