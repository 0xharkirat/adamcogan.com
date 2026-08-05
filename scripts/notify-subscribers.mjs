/**
 * Email the mailing list when Adam publishes.
 *
 * Every hosted email provider charges for RSS-to-email, so this does the same
 * job from a GitHub Action. See the plan in issue #1.
 *
 * It reads the published feed rather than the repository, which is what keeps
 * the ordering correct. A Tina save commits to `main` immediately, but the post
 * has no page until Vercel finishes building. The feed is a build artifact, so
 * a post cannot appear in it before it is live, and an email can never arrive
 * ahead of the thing it links to.
 *
 * State lives at the provider rather than here. Each broadcast records its post
 * URL in the `description` field, so "have I already sent this?" is answered by
 * asking Kit. That means no state file to commit back and no cache to expire.
 *
 * Usage:
 *   node scripts/notify-subscribers.mjs --dry-run        # no API key needed
 *   node scripts/notify-subscribers.mjs                  # creates a draft
 *   node scripts/notify-subscribers.mjs --selftest
 *
 * Environment:
 *   KIT_API_KEY   required unless --dry-run
 *   FEED_URL      defaults to the production feed
 *   MAX_AGE_DAYS  how recent a post must be to qualify, default 7
 *   EXPECT_SLUGS  comma-separated slugs the run must wait for, set by the
 *                 workflow from the pushed files. A post's MDX filename is its
 *                 URL slug, so no date logic has to be restated here.
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const FEED_URL = process.env.FEED_URL || "https://adamcogan.vercel.app/feed.xml";
const MAX_AGE_DAYS = Number(process.env.MAX_AGE_DAYS || 7);
const API = "https://api.kit.com/v4";

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");

/* -------------------------------------------------------------------------
 * Feed reading.
 *
 * Regex rather than an XML parser because this reads one feed that this same
 * repository generates, from `src/pages/feed.xml.ts`. If that ever emits CDATA
 * or namespaced content, unwrapCdata below already covers the first case and
 * the selftest is where the second would be caught.
 * ---------------------------------------------------------------------- */
const unwrapCdata = (s) => s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1").trim();

const decode = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

export function parseFeed(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const field = (name) => {
      const f = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
      return f ? decode(unwrapCdata(f[1])) : "";
    };
    const link = field("link");
    const pubDate = field("pubDate");
    items.push({
      title: field("title"),
      description: field("description"),
      link,
      guid: field("guid") || link,
      pubDate,
      published: pubDate ? new Date(pubDate) : null,
    });
  }
  return items;
}

/**
 * Only recent posts qualify.
 *
 * This is the guard against the archive. The feed carries every post ever
 * published, 184 of them, so without an age limit the first run would treat the
 * entire back catalogue as brand new and mail it. It also means a domain change,
 * which rewrites every `guid`, cannot resurrect old posts.
 */
export function selectCandidate(items, { now, maxAgeDays, alreadySent, slugs = null }) {
  const cutoff = now.getTime() - maxAgeDays * 86_400_000;
  return (
    items
      .filter((i) => i.published && !Number.isNaN(i.published.getTime()))
      .filter((i) => i.published.getTime() >= cutoff)
      .filter((i) => i.published.getTime() <= now.getTime())
      .filter((i) => !alreadySent.has(i.link))
      .filter((i) => slugs === null || matchesSlug(i, slugs))
      .sort((a, b) => b.published - a.published)[0] ?? null
  );
}

/**
 * A post's URL always ends `/<slug>/`, and the slug is its MDX filename. Match
 * on that rather than on the whole URL, so the check survives the move from
 * adamcogan.vercel.app to adamcogan.com.
 */
export function matchesSlug(item, slugs) {
  return slugs.some((s) => item.link.replace(/\/+$/, "").endsWith(`/${s}`));
}

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The feed carries `description`, the post summary, rather than the full body,
 * because `feed.xml.ts` emits no `content:encoded`. So the email is a teaser
 * plus a link. Adding full posts to email means changing the feed first.
 */
export function buildBroadcast(item) {
  const title = escapeHtml(item.title);
  const summary = escapeHtml(item.description);
  const url = item.link;

  return {
    subject: item.title,
    preview_text: item.description.slice(0, 140),
    // Internal-facing in Kit, so it doubles as the dedup key. Keep the bare URL
    // in here: findSentUrls matches on it.
    description: url,
    public: false,
    published_at: item.published.toISOString(),
    send_at: null, // null means draft. Adam presses send.
    subscriber_filter: [],
    content:
      `<h1>${title}</h1>\n` +
      `<p>${summary}</p>\n` +
      `<p><a href="${url}">Read the full post</a></p>\n`,
  };
}

/* ------------------------------------------------------------------------- */

async function kit(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "X-Kit-Api-Key": process.env.KIT_API_KEY,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await res.text();
  if (!res.ok) {
    // Never echo the body blindly on a public repo's logs; it is short and from
    // Kit, but the status and path are what actually diagnose this.
    throw new Error(`Kit ${init.method || "GET"} ${path} failed: ${res.status} ${res.statusText}`);
  }
  return body ? JSON.parse(body) : {};
}

export function findSentUrls(payload) {
  // No `?? []` fallback on purpose. An unrecognised response would otherwise
  // become an empty set, which reads as "nothing has been sent yet" and mails
  // a post a second time. Failing here is the safe direction.
  const list = payload?.broadcasts ?? payload?.data;
  if (!Array.isArray(list)) {
    throw new Error("Unexpected broadcasts response shape from Kit");
  }
  return new Set(
    list
      .map((b) => (b?.description || "").trim())
      .filter((d) => /^https?:\/\//.test(d))
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchFeed() {
  const res = await fetch(FEED_URL, { headers: { "cache-control": "no-cache" } });
  if (!res.ok) throw new Error(`Could not read the feed: ${res.status} ${res.statusText}`);
  return parseFeed(await res.text());
}

/**
 * Wait for the deploy that publishes these slugs.
 *
 * A Tina save reaches `main` before Vercel has rebuilt, so the push that
 * triggers this job runs while the post is still a 404. Polling the feed for
 * the specific slug is what makes the email safe to send: the feed is a build
 * artifact, so the slug appearing in it means the page is live.
 *
 * Failing after the timeout is deliberate. A silent success here would mean the
 * post is published and nobody is ever told.
 */
async function waitForSlugs(slugs, attempts = 20, delayMs = 30_000) {
  for (let i = 1; i <= attempts; i += 1) {
    const items = await fetchFeed();
    if (items.some((it) => matchesSlug(it, slugs))) {
      console.log(`  deploy live after about ${((i - 1) * delayMs) / 1000}s`);
      return items;
    }
    console.log(`  waiting for ${slugs.join(", ")} to appear in the feed (${i}/${attempts})`);
    if (i < attempts) await sleep(delayMs);
  }
  throw new Error(
    `${slugs.join(", ")} never appeared in the feed. The deploy probably failed, ` +
      `so no email was sent. Check Vercel, then re-run this workflow by hand.`
  );
}

/**
 * Walk every page of broadcasts.
 *
 * Kit's list endpoint is cursor-paginated at 500 per page, and its sort order
 * is not documented. Reading only the first page would be the same mistake that
 * once truncated this site's build to 50 of 183 posts, and here it would show
 * up as a post being emailed twice. `slim` is deliberately not used: it drops
 * expensive fields, and `description` is the dedup key.
 */
export async function collectSentUrls(fetchPage, { maxPages = 20 } = {}) {
  const urls = new Set();
  let after = null;
  for (let page = 1; page <= maxPages; page += 1) {
    const payload = await fetchPage(after);
    for (const u of findSentUrls(payload)) urls.add(u);
    const info = payload?.pagination;
    if (!info?.has_next_page || !info?.end_cursor) return urls;
    after = info.end_cursor;
  }
  throw new Error(`Broadcast pagination did not finish within ${maxPages} pages`);
}

async function main() {
  const now = new Date();
  const slugs = (process.env.EXPECT_SLUGS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`  feed        : ${FEED_URL}`);
  if (slugs.length) console.log(`  waiting for : ${slugs.join(", ")}`);
  const items = slugs.length ? await waitForSlugs(slugs) : await fetchFeed();
  console.log(`  items       : ${items.length}`);

  let alreadySent = new Set();
  if (DRY_RUN) {
    console.log(`  mode        : dry run, Kit is not contacted`);
  } else {
    if (!process.env.KIT_API_KEY) throw new Error("KIT_API_KEY is not set");
    alreadySent = await collectSentUrls((after) => {
      const qs = new URLSearchParams({ per_page: "500" });
      if (after) qs.set("after", after);
      return kit(`/broadcasts?${qs}`);
    });
    console.log(`  already sent: ${alreadySent.size}`);
  }

  const candidate = selectCandidate(items, {
    now,
    maxAgeDays: MAX_AGE_DAYS,
    alreadySent,
    slugs: slugs.length ? slugs : null,
  });
  if (!candidate) {
    console.log(`\n  nothing to send. No post in the last ${MAX_AGE_DAYS} days is unsent.`);
    return 0;
  }

  console.log(`\n  candidate   : ${candidate.title}`);
  console.log(`  url         : ${candidate.link}`);
  console.log(`  published   : ${candidate.pubDate}`);

  const payload = buildBroadcast(candidate);

  if (DRY_RUN) {
    console.log(`\n  would create this draft:`);
    console.log(`    subject     : ${payload.subject}`);
    console.log(`    preview     : ${payload.preview_text}`);
    console.log(`    dedup key   : ${payload.description}`);
    console.log(`    send_at     : ${payload.send_at} (null means draft)`);
    console.log(`\n  dry run, nothing was created.`);
    return 0;
  }

  const created = await kit("/broadcasts", { method: "POST", body: JSON.stringify(payload) });
  const id = created?.broadcast?.id ?? "unknown";
  console.log(`\n  ok   created draft broadcast ${id}`);
  console.log(`  It is a draft. Review and send it from Kit.`);
  return 0;
}

/* ------------------------------------------------------------------------- */

async function selftest() {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title>New &amp; shiny</title><description>A summary</description>
      <link>https://example.com/2026/08/02/new/</link>
      <guid>https://example.com/2026/08/02/new/</guid>
      <pubDate>Sun, 02 Aug 2026 14:04:17 GMT</pubDate></item>
    <item><title><![CDATA[Wrapped]]></title><description><![CDATA[Also fine]]></description>
      <link>https://example.com/2026/07/30/wrapped/</link>
      <guid>https://example.com/2026/07/30/wrapped/</guid>
      <pubDate>Wed, 30 Jul 2026 09:00:00 GMT</pubDate></item>
    <item><title>Ancient</title><description>From the archive</description>
      <link>https://example.com/2003/01/01/old/</link>
      <guid>https://example.com/2003/01/01/old/</guid>
      <pubDate>Wed, 01 Jan 2003 00:00:00 GMT</pubDate></item>
  </channel></rss>`;

  const items = parseFeed(xml);
  assert.equal(items.length, 3);
  assert.equal(items[0].title, "New & shiny", "entities decoded");
  assert.equal(items[1].title, "Wrapped", "CDATA unwrapped");
  assert.equal(items[0].guid, items[0].link);

  const now = new Date("2026-08-05T00:00:00Z");

  // The archive must never qualify, which is the whole first-run guard.
  const picked = selectCandidate(items, { now, maxAgeDays: 7, alreadySent: new Set() });
  assert.equal(picked.link, "https://example.com/2026/08/02/new/", "newest recent post wins");

  const none = selectCandidate(items, {
    now,
    maxAgeDays: 7,
    alreadySent: new Set(["https://example.com/2026/08/02/new/"]),
  });
  assert.equal(none.link, "https://example.com/2026/07/30/wrapped/", "falls back past a sent post");

  const allSent = selectCandidate(items, {
    now,
    maxAgeDays: 7,
    alreadySent: new Set([
      "https://example.com/2026/08/02/new/",
      "https://example.com/2026/07/30/wrapped/",
    ]),
  });
  assert.equal(allSent, null, "nothing left to send");

  const archiveOnly = selectCandidate(items, { now, maxAgeDays: 1, alreadySent: new Set() });
  assert.equal(archiveOnly, null, "a tight window excludes everything old");

  // A post dated in the future, which a scheduled Tina save can produce.
  const future = parseFeed(
    `<item><title>Later</title><description>d</description>
     <link>https://example.com/l/</link><guid>https://example.com/l/</guid>
     <pubDate>Sun, 09 Aug 2026 00:00:00 GMT</pubDate></item>`
  );
  assert.equal(
    selectCandidate(future, { now, maxAgeDays: 7, alreadySent: new Set() }),
    null,
    "future-dated posts are not mailed early"
  );

  // Slug restriction: the push tells us which post to wait for.
  assert.ok(matchesSlug(items[0], ["new"]), "trailing slash tolerated");
  assert.ok(!matchesSlug(items[0], ["ew"]), "partial slug must not match");
  assert.ok(!matchesSlug(items[0], ["2026"]), "a path segment that is not the slug must not match");
  assert.equal(
    selectCandidate(items, { now, maxAgeDays: 7, alreadySent: new Set(), slugs: ["wrapped"] }).link,
    "https://example.com/2026/07/30/wrapped/",
    "restricting to a slug overrides newest-wins"
  );
  assert.equal(
    selectCandidate(items, { now, maxAgeDays: 7, alreadySent: new Set(), slugs: ["nope"] }),
    null,
    "an unknown slug selects nothing"
  );

  const b = buildBroadcast(items[0]);
  assert.equal(b.send_at, null, "must be a draft");
  assert.equal(b.description, items[0].link, "dedup key is the post URL");
  assert.equal(b.public, false);
  assert.ok(b.content.includes("New &amp; shiny"), "title is html-escaped in the body");
  assert.ok(b.content.includes(items[0].link));

  assert.deepEqual(
    findSentUrls({ broadcasts: [{ description: "https://example.com/a/" }, { description: "notes" }] }),
    new Set(["https://example.com/a/"]),
    "only URL-shaped descriptions count as dedup keys"
  );
  assert.throws(() => findSentUrls({ nope: 1 }), /Unexpected broadcasts response/);

  // Pagination: page 1 must not be mistaken for the whole list.
  const pages = [
    { broadcasts: [{ description: "https://e.com/a/" }], pagination: { has_next_page: true, end_cursor: "c1" } },
    { broadcasts: [{ description: "https://e.com/b/" }], pagination: { has_next_page: false, end_cursor: null } },
  ];
  const seenCursors = [];
  const collected = await collectSentUrls((after) => {
    seenCursors.push(after);
    return Promise.resolve(pages[seenCursors.length - 1]);
  });
  assert.deepEqual(collected, new Set(["https://e.com/a/", "https://e.com/b/"]), "both pages read");
  assert.deepEqual(seenCursors, [null, "c1"], "the cursor is passed through");

  await assert.rejects(
    () => collectSentUrls(() => Promise.resolve({
      broadcasts: [], pagination: { has_next_page: true, end_cursor: "loop" },
    }), { maxPages: 3 }),
    /pagination did not finish/,
    "a runaway cursor is caught rather than looping forever"
  );

  console.log("  ok   all self-checks passed");
  return 0;
}

// Only act when run as a script. Without this, importing the module to reuse a
// function fires main(), which fetches the feed as a side effect.
const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (!isEntryPoint) {
  // Imported for its exports. Do nothing.
} else if (argv.includes("--selftest")) {
  selftest()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
} else {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      // Loud failure on purpose. A silent one leaves Adam believing the list
      // was emailed when it was not.
      console.error(`\n  FAILED: ${err.message}`);
      process.exit(1);
    });
}
