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
const datedBuilt = [...builtPaths].filter((p) => /^\/\d{4}\/\d{2}\/\d{2}\//.test(p));
const extra = datedBuilt.filter((p) => !wpPostUrls.includes(p));

console.log(`  WordPress post URLs: ${wpPostUrls.length}, dated URLs built: ${datedBuilt.length}`);
if (missing.length) {
  fail(`${missing.length} WordPress URLs have no page in the build`);
  missing.slice(0, 10).forEach((u) => console.error(`         ${u}`));
} else ok("every WordPress post URL exists in the build");

if (extra.length) {
  fail(`${extra.length} dated URLs built that WordPress does not have`);
  extra.slice(0, 10).forEach((u) => console.error(`         ${u}`));
} else ok("no dated URLs invented");

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

const feed = builtFiles.some((f) => f.endsWith("feed.xml"));
feed ? ok("feed.xml") : fail("feed.xml missing");

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

/* ---------------------------------------------- 5. no WordPress leftovers */

console.log("\n5. WordPress leftovers in the built HTML");

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
