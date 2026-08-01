/**
 * Phase 4: make the downloaded media deployable.
 *
 * The WordPress library holds camera and phone originals (one photo is
 * 8256x5504, 16 MB) totalling ~641 MB, which is more than a git repo should
 * carry and more than some hosts accept per file.
 *
 *   images  -> resized to a 2000px long edge and encoded as WebP
 *   GIFs    -> animated WebP, preserving the animation
 *   video   -> VP9/WebM plus an H.264/MP4 fallback
 *
 * The content column is 665px wide, so 2000px still covers 3x retina.
 *
 * Run this against freshly downloaded originals, not against its own output:
 * re-encoding an already-encoded file loses quality for no size benefit.
 * Files whose format does not change are left alone when already small, so a
 * second run is close to a no-op, but `3-media.mjs` should be re-run first if
 * the settings here change.
 *
 * Every rename is propagated back into the MDX, so the content never points at
 * a file that no longer exists.
 */
import { readdir, readFile, writeFile, stat, unlink, rename } from "node:fs/promises";
import { join, extname, dirname, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PUBLIC = join(ROOT, "public");
const MEDIA = join(PUBLIC, "media");

const MAX_EDGE = 2000;
const WEBP_QUALITY = 82;
const CONCURRENCY = 6;

const RASTER = new Set([".jpg", ".jpeg", ".png"]);
const VIDEO = new Set([".mp4", ".mov", ".m4v", ".webm"]);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const webPath = (file) => `/${relative(PUBLIC, file).split(/[\\/]/).join("/")}`;

/* --------------------------------------------------------------- images */

async function optimiseImage(file) {
  const before = (await stat(file)).size;
  const ext = extname(file).toLowerCase();
  const target = file.slice(0, -ext.length) + ".webp";

  const animated = ext === ".gif";
  const image = sharp(file, { failOn: "none", animated });
  const meta = await image.metadata();

  // Animated frames stack vertically in `pageHeight`, so resizing an animated
  // GIF by its reported height would squash every frame. Only width is capped.
  const pipeline = animated
    ? image.resize({ width: Math.min(meta.width ?? MAX_EDGE, MAX_EDGE), withoutEnlargement: true })
    : image.rotate().resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      });

  const buf = await pipeline.webp({ quality: WEBP_QUALITY, effort: 5 }).toBuffer();

  // Keep the original when WebP genuinely loses, which happens for a few tiny
  // flat-colour PNGs where the WebP container overhead dominates.
  if (buf.length >= before && buf.length > 20_000) {
    return { file, status: "kept-original", before, after: before };
  }

  await writeFile(target, buf);
  if (target !== file) await unlink(file);
  return {
    file,
    status: "webp",
    before,
    after: buf.length,
    renamedFrom: target !== file ? webPath(file) : null,
    renamedTo: target !== file ? webPath(target) : null,
  };
}

/* ---------------------------------------------------------------- video */

/**
 * Emit both VP9/WebM and H.264/MP4. WebM is the smaller file but Safari only
 * gained VP9-in-WebM support in 14.1, so the MP4 stays as a <source> fallback
 * rather than being deleted.
 */
async function optimiseVideo(file) {
  const before = (await stat(file)).size;
  const stem = file.slice(0, -extname(file).length);
  const mp4 = `${stem}.mp4`;
  const webm = `${stem}.webm`;
  const scale = "scale='min(1920,iw)':-2";

  await run("ffmpeg", [
    "-y", "-i", file,
    "-vf", scale,
    "-c:v", "libx264", "-preset", "slow", "-crf", "23",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "128k",
    `${mp4}.tmp.mp4`,
  ]);
  await run("ffmpeg", [
    "-y", "-i", file,
    "-vf", scale,
    "-c:v", "libvpx-vp9", "-crf", "34", "-b:v", "0", "-row-mt", "1",
    "-c:a", "libopus", "-b:a", "96k",
    `${webm}.tmp.webm`,
  ]);

  if (file !== mp4) await unlink(file);
  await rename(`${mp4}.tmp.mp4`, mp4);
  await rename(`${webm}.tmp.webm`, webm);

  const after = (await stat(mp4)).size + (await stat(webm)).size;
  return {
    file,
    status: "transcoded",
    before,
    after,
    renamedFrom: file !== mp4 ? webPath(file) : null,
    renamedTo: file !== mp4 ? webPath(mp4) : null,
  };
}

/* ------------------------------------------------------------------ run */

const files = await walk(MEDIA);
const present = new Set(files);
const images = files.filter((f) => RASTER.has(extname(f).toLowerCase()) || extname(f).toLowerCase() === ".gif");

/**
 * Only unprocessed sources. Without this the script is not idempotent for
 * video: a second run treats its own .mp4 and .webm outputs as inputs and
 * re-encodes both, which loses quality and, because it re-compresses already
 * compressed data, makes the files bigger.
 *
 * A .webm is only ever an output. An .mp4 with a sibling .webm has already
 * been through this, so it is left alone.
 */
const videos = files.filter((f) => {
  const ext = extname(f).toLowerCase();
  if (!VIDEO.has(ext)) return false;
  if (ext === ".webm") return false;
  const sibling = `${f.slice(0, -ext.length)}.webm`;
  if (ext === ".mp4" && present.has(sibling)) return false;
  return true;
});
console.log(`${images.length} images, ${videos.length} videos.`);

const results = [];
const queue = [...images];
let done = 0;

await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const file = queue.shift();
      try {
        results.push(await optimiseImage(file));
      } catch (err) {
        results.push({ file, status: "error", error: err.message, before: 0, after: 0 });
      }
      if (++done % 50 === 0 || !queue.length) process.stdout.write(`\r  images ${done}/${images.length}   `);
    }
  }),
);
process.stdout.write("\n");

for (const [i, file] of videos.entries()) {
  process.stdout.write(`\r  videos ${i + 1}/${videos.length} (${basename(file)})          `);
  try {
    results.push(await optimiseVideo(file));
  } catch (err) {
    results.push({ file, status: "error", error: err.message, before: 0, after: 0 });
  }
}
process.stdout.write("\n");

/* Propagate every rename into the migrated content. */
const renames = results.filter((r) => r.renamedFrom).map((r) => [r.renamedFrom, r.renamedTo]);
if (renames.length) {
  // Keyed on the decoded path. Content stores percent-encoded URLs, while the
  // map is built from raw filesystem paths, and some uploads contain
  // characters that differ between the two (one macOS screenshot has a narrow
  // no-break space). Comparing decoded on both sides is what makes them meet.
  const map = new Map(renames.map(([from, to]) => [decodeURI(from), to]));
  const reencode = (path) => path.split("/").map(encodeURIComponent).join("/");
  let touched = 0;
  for (const dir of [join(ROOT, "src", "content", "blog"), join(ROOT, "src", "content", "page")]) {
    for (const name of await readdir(dir)) {
      if (!name.endsWith(".mdx")) continue;
      const path = join(dir, name);
      const original = await readFile(path, "utf8");
      // Replace whole /media/... paths only, so a filename that happens to be a
      // substring of another cannot be corrupted.
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
  console.log(`Rewrote media references in ${touched} content files (${renames.length} renames).`);
}

const sum = (k) => results.reduce((n, r) => n + (r[k] || 0), 0);
const count = (s) => results.filter((r) => r.status === s).length;
const errors = results.filter((r) => r.status === "error");

console.log(
  `\nwebp ${count("webp")}, transcoded ${count("transcoded")}, ` +
    `kept ${count("kept-original")}, errors ${errors.length}`,
);
console.log(
  `${(sum("before") / 1048576).toFixed(0)} MB -> ${(sum("after") / 1048576).toFixed(0)} MB ` +
    `(${(100 - (sum("after") / sum("before")) * 100).toFixed(0)}% smaller)`,
);
for (const e of errors) console.warn(`  ERROR ${e.file}: ${e.error}`);

await writeFile(join(ROOT, "migration", "raw", "_optimise-report.json"), JSON.stringify(results, null, 2));
