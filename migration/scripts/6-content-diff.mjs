/**
 * Phase 6: compare every migrated post's text against the WordPress original.
 *
 * Screenshots cannot answer "did any of the 183 posts lose a paragraph". This
 * does, by reducing both sides to plain words and diffing them, so a dropped
 * section, a mangled table or a lost caption shows up as missing words rather
 * than being spotted by eye on a sample.
 *
 * Compares the raw WordPress HTML (migration/raw/posts.json) against the built
 * output in dist/, so it measures what actually ships, not what the transform
 * intended.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RAW = join(ROOT, "migration", "raw");
const DIST = join(ROOT, "dist", "client");

/** Words that are expected to differ, because the rebuild deliberately changed them. */
const IGNORED_PHRASES = [
  "themify_builder_content",
];

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…",
  mdash: "-", ndash: "-", lsquo: "'", rsquo: "'", ldquo: '"', rdquo: '"',
  laquo: "<<", raquo: ">>", trade: "tm", copy: "(c)", reg: "(r)", deg: "deg",
  middot: "-", bull: "-", prime: "'", Prime: '"', eacute: "e",
};

function decode(s) {
  return String(s ?? "")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n] ?? ENTITIES[n.toLowerCase()] ?? " ");
}

/**
 * Reduce markup to comparable words.
 *
 * Punctuation and case are dropped because the transform legitimately rewrites
 * smart quotes and entities; what matters is whether the words survived.
 */
function words(html) {
  let text = String(html ?? "");
  text = text.replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, " ");
  text = text.replace(/<!--[\s\S]*?-->/g, " ");
  text = text.replace(/<[^>]+>/g, " ");
  text = decode(text);
  for (const phrase of IGNORED_PHRASES) text = text.split(phrase).join(" ");
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Multiset difference: words in `a` that `a` has more copies of than `b`. */
function missingFrom(a, b) {
  const counts = new Map();
  for (const w of b) counts.set(w, (counts.get(w) ?? 0) + 1);
  const missing = [];
  for (const w of a) {
    const left = counts.get(w) ?? 0;
    if (left > 0) counts.set(w, left - 1);
    else missing.push(w);
  }
  return missing;
}

/** Pull just the article body out of a built page. */
function extractEntry(html) {
  const start = html.indexOf('class="entry');
  if (start === -1) return null;
  const open = html.lastIndexOf("<div", start);
  // Walk div nesting to find the matching close, so sibling markup is excluded.
  let depth = 0;
  const re = /<\/?div\b[^>]*>/gi;
  re.lastIndex = open;
  let m;
  while ((m = re.exec(html))) {
    depth += m[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(open, m.index);
  }
  return html.slice(open);
}

const posts = JSON.parse(await readFile(join(RAW, "posts.json"), "utf8"));
const results = [];

for (const post of posts) {
  const path = new URL(post.link).pathname;
  const file = join(DIST, path.replace(/^\/|\/$/g, ""), "index.html");

  let built;
  try {
    built = await readFile(file, "utf8");
  } catch {
    results.push({ slug: post.slug, path, status: "PAGE MISSING" });
    continue;
  }

  const entry = extractEntry(built);
  if (!entry) {
    results.push({ slug: post.slug, path, status: "NO ENTRY BODY" });
    continue;
  }

  const original = words(post.content.rendered);
  const rebuilt = words(entry);
  const missing = missingFrom(original, rebuilt);
  const added = missingFrom(rebuilt, original);

  // Word tokens over-report. WordPress content is full of inline markup that
  // splits words mid-string, like `<span class="s1">p</span>owered` from a Word
  // paste, or `1<sup>st</sup>`. Those tokenize as "p" + "owered" on the
  // original and "powered" on ours, which looks like loss but is the rebuild
  // being cleaner. Comparing the letter stream ignores where tags fell.
  const letters = (list) => list.join("");
  const sameLetters = letters(original) === letters(rebuilt);

  results.push({
    slug: post.slug,
    path,
    status: "ok",
    sameLetters,
    originalWords: original.length,
    rebuiltWords: rebuilt.length,
    missing: missing.length,
    added: added.length,
    missingPct: original.length ? (missing.length / original.length) * 100 : 0,
    missingSample: missing.slice(0, 25),
    addedSample: added.slice(0, 15),
  });
}

/* ------------------------------------------------------------- reporting */

const broken = results.filter((r) => r.status !== "ok");
const scored = results.filter((r) => r.status === "ok");
const clean = scored.filter((r) => r.missing === 0);
// Word-level differences that vanish once inline markup is ignored are not
// content loss, so they are reported separately from real gaps.
const fragmentedOnly = scored.filter((r) => r.missing > 0 && r.sameLetters);
const realLoss = scored.filter((r) => r.missing > 0 && !r.sameLetters);
// A handful of stray words is normal: the transform rewrites entities and
// smart quotes. Whole sentences going missing is not.
const minor = realLoss.filter((r) => r.missingPct < 2);
const major = realLoss.filter((r) => r.missingPct >= 2).sort((a, b) => b.missingPct - a.missingPct);

console.log(`\nContent diff: ${results.length} posts compared against the WordPress originals\n`);
console.log(`  identical word-for-word          : ${clean.length}`);
console.log(`  identical ignoring inline markup : ${fragmentedOnly.length}`);
console.log(`  real loss, under 2%              : ${minor.length}`);
console.log(`  real loss, 2% or more            : ${major.length}`);
console.log(`  could not compare                : ${broken.length}`);

if (broken.length) {
  console.log("\nCould not compare:");
  for (const b of broken) console.log(`  ${b.status}  ${b.path}`);
}

if (major.length) {
  console.log("\nPosts losing 2% or more of their words:");
  for (const r of major.slice(0, 20)) {
    console.log(
      `  ${r.missingPct.toFixed(1).padStart(5)}%  ${r.missing}/${r.originalWords}  ${r.path}`,
    );
    console.log(`          missing: ${r.missingSample.slice(0, 15).join(" ")}`);
  }
}

if (fragmentedOnly.length) {
  console.log(
    `\n${fragmentedOnly.length} post(s) differ only in where the original's inline tags split words ` +
      `(e.g. 1<sup>st</sup>). Same letters, no content lost.`,
  );
}

if (minor.length) {
  console.log("\nReal differences (under 2%), most affected first:");
  for (const r of [...minor].sort((a, b) => b.missing - a.missing).slice(0, 10)) {
    console.log(`  ${r.missing.toString().padStart(3)} words  ${r.path}`);
    console.log(`          ${r.missingSample.slice(0, 12).join(" ")}`);
  }
}

await writeFile(join(RAW, "_content-diff.json"), JSON.stringify(results, null, 2));
console.log(`\nFull report: migration/raw/_content-diff.json\n`);

process.exit(broken.length || major.length ? 1 : 0);
