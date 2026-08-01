/**
 * Phase 3: pull every referenced upload into public/media so the new site has
 * no runtime dependency on the WordPress host.
 *
 * Only what the migrated content actually references, not the whole 1247-item
 * library: most of that is auto-generated thumbnail variants and orphans.
 * Sources scanned are the MDX output itself (single source of truth) plus the
 * featured-image records, so this stays in step with whatever the transform
 * emitted.
 */
import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "./lib/images.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PUBLIC = join(ROOT, "public");
const CONCURRENCY = 8;

/* ------------------------------------------------- collect referenced paths */

const contentDirs = [join(ROOT, "src", "content", "blog"), join(ROOT, "src", "content", "page")];
const referenced = new Set();

for (const dir of contentDirs) {
  for (const file of await readdir(dir)) {
    if (!file.endsWith(".mdx")) continue;
    const text = await readFile(join(dir, file), "utf8");
    for (const m of text.matchAll(/\/media\/[^\s"')\]]+/g)) referenced.add(decodeURI(m[0]));
  }
}

console.log(`${referenced.size} distinct /media paths referenced by the migrated content.`);

/**
 * Map each local path back to the candidate remote URLs. The transform
 * upgraded resized variants to the original, which may not exist for images
 * that were only ever uploaded at one size, so keep the variant as a fallback.
 */
const raw = JSON.parse(await readFile(join(ROOT, "migration", "raw", "posts.json"), "utf8"))
  .concat(JSON.parse(await readFile(join(ROOT, "migration", "raw", "pages.json"), "utf8")));

const variantsByLocal = new Map();
const note = (url) => {
  const info = parse(url);
  if (!info) return;
  if (!variantsByLocal.has(info.localPath)) variantsByLocal.set(info.localPath, new Set());
  variantsByLocal.get(info.localPath).add(info.referencedUrl);
};

for (const p of raw) {
  for (const m of p.content.rendered.matchAll(/(?:src|href)="([^"]+)"/gi)) note(m[1]);
}
for (const m of JSON.parse(await readFile(join(ROOT, "migration", "raw", "media.json"), "utf8"))) {
  note(m.source_url);
}

/* ------------------------------------------------------------- downloading */

async function download(localPath) {
  const diskPath = join(PUBLIC, decodeURI(localPath).replace(/^\//, ""));
  try {
    if ((await stat(diskPath)).size > 0) return { localPath, status: "cached" };
  } catch {
    /* not downloaded yet */
  }

  const original = `https://adamcogan.com/wp-content/uploads/${decodeURI(localPath).replace(/^\/media\//, "")}`;
  const candidates = [original, ...(variantsByLocal.get(localPath) ?? [])];

  let lastError = "no candidates";
  for (const candidate of candidates) {
    try {
      const res = await fetch(encodeURI(decodeURI(candidate)), {
        headers: { "user-agent": "adamcogan-migration/1.0" },
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) {
        lastError = "empty body";
        continue;
      }
      await mkdir(dirname(diskPath), { recursive: true });
      await writeFile(diskPath, buf);
      return {
        localPath,
        status: candidate === original ? "ok" : "fallback",
        bytes: buf.length,
        from: candidate,
      };
    } catch (err) {
      lastError = err.message;
    }
  }
  return { localPath, status: "failed", error: lastError };
}

const queue = [...referenced];
const results = [];
let done = 0;

await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const item = queue.shift();
      results.push(await download(item));
      done += 1;
      if (done % 25 === 0 || !queue.length) {
        process.stdout.write(`\r  downloaded ${done}/${referenced.size}   `);
      }
    }
  }),
);
process.stdout.write("\n");

const by = (s) => results.filter((r) => r.status === s);
const failed = by("failed");
const bytes = results.reduce((n, r) => n + (r.bytes ?? 0), 0);

console.log(
  `\nok ${by("ok").length}, fallback-to-variant ${by("fallback").length}, ` +
    `cached ${by("cached").length}, failed ${failed.length}. ` +
    `${(bytes / 1024 / 1024).toFixed(1)} MB fetched.`,
);
if (failed.length) {
  console.warn("\nFAILED:");
  for (const f of failed) console.warn(`  ${f.localPath} (${f.error})`);
}

await writeFile(
  join(ROOT, "migration", "raw", "_media-report.json"),
  JSON.stringify({ total: referenced.size, failed, results }, null, 2),
);
