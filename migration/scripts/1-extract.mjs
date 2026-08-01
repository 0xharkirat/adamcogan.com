/**
 * Phase 1, Track A: pull everything from the adamcogan.com WordPress REST API
 * into migration/raw/ as JSON.
 *
 * Raw dump lands first so every later transform is re-runnable offline.
 * Posts are fetched WITHOUT _embed (that payload timed out at per_page=100 and
 * is redundant): authors, terms and featured media come down as small lookup
 * tables instead, keyed by id.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = "https://adamcogan.com";
const API = `${SITE}/wp-json/wp/v2`;
const RAW = join(dirname(fileURLToPath(import.meta.url)), "..", "raw");

async function get(url, attempt = 1) {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "adamcogan-migration/1.0" },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return {
      body: await res.json(),
      total: Number(res.headers.get("x-wp-total") || 0),
      totalPages: Number(res.headers.get("x-wp-totalpages") || 0),
    };
  } catch (err) {
    if (attempt >= 4) throw err;
    const wait = 1000 * 2 ** (attempt - 1);
    console.warn(`  retry ${attempt} in ${wait}ms: ${err.message}`);
    await new Promise((r) => setTimeout(r, wait));
    return get(url, attempt + 1);
  }
}

/** Walk every page of a collection endpoint. */
async function getAll(resource, perPage = 20, extra = "") {
  const out = [];
  let page = 1;
  let totalPages = 1;
  do {
    const { body, totalPages: tp, total } = await get(
      `${API}/${resource}?per_page=${perPage}&page=${page}&orderby=id&order=asc${extra}`,
    );
    totalPages = tp || 1;
    out.push(...body);
    process.stdout.write(
      `\r  ${resource}: ${out.length}${total ? `/${total}` : ""} (page ${page}/${totalPages})   `,
    );
    page += 1;
  } while (page <= totalPages);
  process.stdout.write("\n");
  return out;
}

async function dump(name, data) {
  await writeFile(join(RAW, `${name}.json`), JSON.stringify(data, null, 2));
  console.log(`  -> raw/${name}.json (${Array.isArray(data) ? data.length : 1} records)`);
}

await mkdir(RAW, { recursive: true });

console.log("Posts");
const posts = await getAll("posts", 20, "&status=publish");
await dump("posts", posts);

console.log("Pages");
const pages = await getAll("pages", 20, "&status=publish");
await dump("pages", pages);

console.log("Taxonomies + users");
const [categories, tags, users] = await Promise.all([
  getAll("categories", 100),
  getAll("tags", 100),
  getAll("users", 100),
]);
await dump("categories", categories);
await dump("tags", tags);
await dump("users", users);

// Featured media only: pulling all 1247 library items would mostly be thumbnail
// variants we never reference. Inline images are resolved from post HTML later.
const featuredIds = [...new Set([...posts, ...pages].map((p) => p.featured_media).filter(Boolean))];
console.log(`Featured media (${featuredIds.length} referenced ids)`);
const media = [];
for (let i = 0; i < featuredIds.length; i += 50) {
  const batch = featuredIds.slice(i, i + 50);
  const { body } = await get(`${API}/media?include=${batch.join(",")}&per_page=100`);
  media.push(...body);
  process.stdout.write(`\r  media: ${media.length}/${featuredIds.length}   `);
}
process.stdout.write("\n");
await dump("media", media);

const missingFeatured = featuredIds.filter((id) => !media.some((m) => m.id === id));

await dump("_summary", {
  extractedFrom: SITE,
  posts: posts.length,
  pages: pages.length,
  categories: categories.length,
  tags: tags.length,
  users: users.map((u) => ({ id: u.id, slug: u.slug, name: u.name })),
  featuredMediaReferenced: featuredIds.length,
  featuredMediaResolved: media.length,
  missingFeaturedMediaIds: missingFeatured,
  earliestPost: posts.reduce((a, p) => (p.date < a ? p.date : a), posts[0]?.date),
  latestPost: posts.reduce((a, p) => (p.date > a ? p.date : a), posts[0]?.date),
});

console.log(
  `\nDone. ${posts.length} posts, ${pages.length} pages, ${categories.length} categories, ` +
    `${tags.length} tags, ${media.length} featured media.`,
);
if (missingFeatured.length) {
  console.warn(`WARNING: ${missingFeatured.length} featured media ids did not resolve.`);
}
