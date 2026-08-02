/**
 * Phase 5: prove the migration did not lose or move anything.
 *
 * The whole point of preserving /YYYY/MM/DD/<slug>/ is that inbound links to a
 * site running since 2002 keep working, so this diffs the built output against
 * the live WordPress sitemap rather than trusting that the routes look right.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIST = join(ROOT, "dist", "client");
const PUBLIC = join(ROOT, "public");

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error(`  FAIL ${msg}`);
};
const ok = (msg) => console.log(`  ok   ${msg}`);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

/* ---------------------------------------------- 1. URLs vs the WP sitemap */

console.log("\n1. Permalinks against the live WordPress sitemap");

const sitemapXml = await (await fetch("https://adamcogan.com/wp-sitemap-posts-post-1.xml")).text();
const wpPostUrls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => new URL(m[1]).pathname)
  .sort();

const builtFiles = await walk(DIST);
const builtPaths = new Set(
  builtFiles
    .filter((f) => f.endsWith("index.html"))
    .map((f) => {
      const rel = relative(DIST, dirname(f)).split(/[\\/]/).filter(Boolean).join("/");
      return rel ? `/${rel}/` : "/";
    }),
);

const missing = wpPostUrls.filter((u) => !builtPaths.has(u));
// A post has a fourth segment; /2026/07/29/ on its own is the day archive.
const datedBuilt = [...builtPaths].filter((p) => /^\/\d{4}\/\d{2}\/\d{2}\/[^/]+\//.test(p));
const extra = datedBuilt.filter((p) => !wpPostUrls.includes(p));

console.log(`  WordPress post URLs: ${wpPostUrls.length}, dated URLs built: ${datedBuilt.length}`);
if (missing.length) {
  fail(`${missing.length} WordPress URLs have no page in the build`);
  missing.slice(0, 10).forEach((u) => console.error(`         ${u}`));
} else ok("every WordPress post URL exists in the build");

// Posts written since the migration have no legacyUrl and are not expected in
// the WordPress sitemap. Only a post claiming to be migrated is a problem here,
// because that means its permalink moved.
const migratedPaths = new Set();
const newPaths = new Set();
for (const name of await readdir(join(ROOT, "src", "content", "blog"))) {
  if (!name.endsWith(".mdx")) continue;
  const text = await readFile(join(ROOT, "src", "content", "blog", name), "utf8");
  const legacy = text.match(/^legacyUrl:\s*"([^"]+)"/m)?.[1];
  (legacy ? migratedPaths : newPaths).add(name.replace(/\.mdx$/, ""));
}

const movedPosts = extra.filter((u) => {
  const slug = u.split("/").filter(Boolean).pop();
  return migratedPaths.has(slug);
});
const addedSincePosts = extra.filter((u) => {
  const slug = u.split("/").filter(Boolean).pop();
  return newPaths.has(slug);
});

if (movedPosts.length) {
  fail(`${movedPosts.length} migrated post(s) no longer at their WordPress URL`);
  movedPosts.slice(0, 10).forEach((u) => console.error(`         ${u}`));
} else ok("no migrated post moved off its WordPress URL");

if (addedSincePosts.length) {
  console.log(`  note ${addedSincePosts.length} post(s) written since the migration: ${addedSincePosts.join(", ")}`);
}

/* ---------------------------------------------- 2. legacyUrl round-trip */

console.log("\n2. legacyUrl in frontmatter matches the built path");

const blogDir = join(ROOT, "src", "content", "blog");
let mismatched = 0;
for (const name of await readdir(blogDir)) {
  if (!name.endsWith(".mdx")) continue;
  const text = await readFile(join(blogDir, name), "utf8");
  const legacy = text.match(/^legacyUrl:\s*"([^"]+)"/m)?.[1];
  if (!legacy) continue;
  if (!builtPaths.has(legacy)) {
    mismatched += 1;
    if (mismatched <= 5) console.error(`         ${name}: ${legacy} not built`);
  }
}
if (mismatched) fail(`${mismatched} posts are not served at their original URL`);
else ok("all 183 posts serve at their original WordPress URL");

/* ---------------------------------------------- 3. archives and taxonomy */

console.log("\n3. Archive routes");

const expectPath = (p, label) => (builtPaths.has(p) ? ok(`${label} (${p})`) : fail(`${label} missing: ${p}`));
expectPath("/", "homepage");
expectPath("/page/2/", "homepage pagination");
expectPath("/blog/", "blog listing");
expectPath("/category/general/", "category archive");
expectPath("/tag/scrum/", "tag archive");
expectPath("/2025/", "year archive");
expectPath("/about-adam-cogan/", "about page");
expectPath("/tesla/", "tesla page");
expectPath("/search/", "search page");

const feed = builtFiles.some((f) => f.endsWith("feed.xml"));
feed ? ok("feed.xml") : fail("feed.xml missing");

// The search index is generated after astro build, so it is absent if the
// `index-search` step was skipped. Search silently returns nothing without it.
const pagefind = builtFiles.some((f) => f.includes("/pagefind/") && f.endsWith("pagefind.js"));
pagefind ? ok("pagefind index") : fail("pagefind index missing (run pnpm run index-search)");

/* ------------------------------------------- 3b. date archives */

// WordPress publishes a page at every level of a post's permalink, not just
// the year: /2026/, /2026/01/ and /2026/01/19/ are all real URLs. Only the
// year level existed at first, and nothing caught it because the post sitemap
// does not list archives.
console.log("\n3b. Date archives at every level of each permalink");

const expectedArchives = new Set();
for (const url of wpPostUrls) {
  const m = url.match(/^\/(\d{4})\/(\d{2})\/(\d{2})\//);
  if (!m) continue;
  const [, y, mo, d] = m;
  expectedArchives.add(`/${y}/`);
  expectedArchives.add(`/${y}/${mo}/`);
  expectedArchives.add(`/${y}/${mo}/${d}/`);
}

const missingArchives = [...expectedArchives].filter((p) => !builtPaths.has(p)).sort();
console.log(`  ${expectedArchives.size} date archives implied by the post permalinks`);
if (missingArchives.length) {
  fail(`${missingArchives.length} date archives missing`);
  missingArchives.slice(0, 10).forEach((p) => console.error(`         ${p}`));
} else ok("year, month and day archives all exist");

/* ---------------------------------------------- 4. media integrity */

console.log("\n4. Media referenced by the built HTML");

const htmlFiles = builtFiles.filter((f) => f.endsWith(".html"));
const referenced = new Set();
for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  for (const m of html.matchAll(/(?:src|href)="(\/media\/[^"]+)"/g)) referenced.add(m[1]);
}

let brokenMedia = 0;
for (const ref of referenced) {
  try {
    await stat(join(PUBLIC, decodeURI(ref).slice(1)));
  } catch {
    brokenMedia += 1;
    if (brokenMedia <= 5) console.error(`         ${ref}`);
  }
}
console.log(`  ${referenced.size} distinct media URLs in the built HTML`);
if (brokenMedia) fail(`${brokenMedia} media references have no file`);
else ok("every media reference resolves to a file on disk");

/* ------------------------------------------------------- 5. comments */

console.log("\n5. Migrated comments");

const rawComments = JSON.parse(await readFile(join(ROOT, "migration", "raw", "comments.json"), "utf8"));
const archive = JSON.parse(await readFile(join(ROOT, "src", "data", "comments.json"), "utf8"));
const countAll = (list) => list.reduce((n, c) => n + 1 + countAll(c.replies ?? []), 0);
const archived = Object.values(archive).reduce((n, list) => n + countAll(list), 0);
const approved = rawComments.filter((c) => c.status === "approved").length;

if (archived !== approved) fail(`archived ${archived} comments but ${approved} were approved on WordPress`);
else ok(`all ${archived} approved comments archived across ${Object.keys(archive).length} pages`);

// The bodies are rendered with set:html, so the sanitiser is a trust boundary.
const archiveText = JSON.stringify(archive);
const dangerous = /<script|<iframe|javascript:|\son[a-z]+\s*=/i.exec(archiveText);
if (dangerous) fail(`archived comment HTML contains "${dangerous[0]}"`);
else ok("no scripts, iframes, javascript: URLs or event handlers in comment HTML");

// A rendered page should actually show them, not just hold the data.
const sampleSlug = Object.keys(archive).find((s) => countAll(archive[s]) > 1);
let rendered = false;
if (sampleSlug) {
  const author = archive[sampleSlug][0].author;
  for (const f of builtFiles) {
    if (!f.endsWith("index.html") || !f.includes(sampleSlug)) continue;
    const html = await readFile(f, "utf8");
    if (html.includes('id="comments"') && html.includes(author)) { rendered = true; break; }
  }
}
if (rendered) ok(`comments render on the page (checked "${sampleSlug}")`);
else fail(`comments data exists but no built page renders them (checked "${sampleSlug}")`);



/* ---------------------------------------------- 6. no WordPress leftovers */

console.log("\n6. WordPress leftovers in the built HTML");

const leaks = { "wp-content": 0, themify: 0, "wp-block": 0 };
for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  for (const needle of Object.keys(leaks)) {
    // firebootcamp.com and ssw.com.au are third-party hosts we deliberately
    // keep hotlinked, so only adamcogan.com references count as a leak.
    const hits =
      needle === "wp-content"
        ? (html.match(/adamcogan\.com\/wp-content/g) ?? []).length
        : (html.match(new RegExp(needle, "g")) ?? []).length;
    leaks[needle] += hits;
  }
}
for (const [needle, count] of Object.entries(leaks)) {
  if (count) fail(`${count} occurrences of "${needle}" in the built HTML`);
  else ok(`no "${needle}"`);
}

/* ------------------------------------------------------------------ done */

console.log(
  failures === 0
    ? `\nAll checks passed. ${builtPaths.size} pages built.\n`
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
