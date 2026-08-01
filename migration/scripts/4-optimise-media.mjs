/**
 * Phase 4: make the downloaded media deployable.
 *
 * The WordPress library holds camera and phone originals (one photo is
 * 8256x5504, 16 MB) which is ~645 MB in total. The site's content column is
 * 665px wide, so a 2000px long edge still covers 3x retina and any lightbox
 * use, at roughly a twentieth of the bytes.
 *
 * Videos are transcoded to H.264 MP4: the 33 MB .mov does not play reliably
 * outside Safari, and hosts cap individual asset sizes.
 *
 * Idempotent: files already at or under the target are left untouched, so a
 * second run is a no-op. Originals remain on the WordPress host, and
 * `1-extract` + `3-media` re-fetch them, so nothing here is a one-way door.
 */
import { readdir, readFile, writeFile, stat, rename, unlink } from "node:fs/promises";
import { join, extname, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MEDIA = join(ROOT, "public", "media");

const MAX_EDGE = 2000;
const JPEG_QUALITY = 82;
const CONCURRENCY = 6;

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const RASTER = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const VIDEO = new Set([".mp4", ".mov", ".m4v", ".webm"]);

async function optimiseImage(file) {
  const before = (await stat(file)).size;
  const image = sharp(file, { failOn: "none" });
  const meta = await image.metadata();
  const ext = extname(file).toLowerCase();

  const oversized = Math.max(meta.width ?? 0, meta.height ?? 0) > MAX_EDGE;
  // Animated GIFs are excluded upstream; PNGs that are already small are
  // usually screenshots or logos where re-encoding gains nothing.
  if (!oversized && before < 400_000) return { file, status: "skipped", before, after: before };

  let pipeline = image.rotate().resize({
    width: MAX_EDGE,
    height: MAX_EDGE,
    fit: "inside",
    withoutEnlargement: true,
  });

  pipeline =
    ext === ".png"
      ? pipeline.png({ compressionLevel: 9, palette: true })
      : ext === ".webp"
        ? pipeline.webp({ quality: JPEG_QUALITY })
        : pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true });

  const buf = await pipeline.toBuffer();
  if (buf.length >= before) return { file, status: "kept-original", before, after: before };

  await writeFile(file, buf);
  return { file, status: "resized", before, after: buf.length };
}

/**
 * Transcode to H.264 + AAC in an MP4 container. `.mov` files are additionally
 * renamed, so every reference to them in the MDX has to be rewritten too.
 */
async function optimiseVideo(file) {
  const before = (await stat(file)).size;
  const target = file.replace(/\.(mov|m4v|webm)$/i, ".mp4");
  const tmp = `${target}.tmp.mp4`;

  await run("ffmpeg", [
    "-y", "-i", file,
    "-vf", "scale='min(1920,iw)':-2",
    "-c:v", "libx264", "-preset", "slow", "-crf", "23",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "128k",
    tmp,
  ]);

  const after = (await stat(tmp)).size;
  if (after >= before && target === file) {
    await unlink(tmp);
    return { file, status: "kept-original", before, after: before };
  }

  if (target !== file) await unlink(file);
  await rename(tmp, target);
  return {
    file,
    status: "transcoded",
    before,
    after,
    renamedFrom: target !== file ? `/${relative(join(ROOT, "public"), file)}` : null,
    renamedTo: target !== file ? `/${relative(join(ROOT, "public"), target)}` : null,
  };
}

/* ------------------------------------------------------------------- run */

const files = await walk(MEDIA);
const images = files.filter((f) => RASTER.has(extname(f).toLowerCase()));
const videos = files.filter((f) => VIDEO.has(extname(f).toLowerCase()));
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

const renames = [];
for (const [i, file] of videos.entries()) {
  process.stdout.write(`\r  videos ${i + 1}/${videos.length}   `);
  try {
    const r = await optimiseVideo(file);
    results.push(r);
    if (r.renamedFrom) renames.push([r.renamedFrom, r.renamedTo]);
  } catch (err) {
    results.push({ file, status: "error", error: err.message, before: 0, after: 0 });
  }
}
process.stdout.write("\n");

// A .mov became a .mp4, so every reference in the migrated content must follow.
if (renames.length) {
  for (const dir of [join(ROOT, "src", "content", "blog"), join(ROOT, "src", "content", "page")]) {
    for (const name of await readdir(dir)) {
      if (!name.endsWith(".mdx")) continue;
      const path = join(dir, name);
      const original = await readFile(path, "utf8");
      let updated = original;
      for (const [from, to] of renames) updated = updated.split(from).join(to);
      if (updated !== original) {
        await writeFile(path, updated);
        console.log(`  rewrote video reference in ${name}`);
      }
    }
  }
}

const sum = (k) => results.reduce((n, r) => n + (r[k] || 0), 0);
const count = (s) => results.filter((r) => r.status === s).length;
const errors = results.filter((r) => r.status === "error");

console.log(
  `\nresized ${count("resized")}, transcoded ${count("transcoded")}, ` +
    `skipped ${count("skipped")}, kept ${count("kept-original")}, errors ${errors.length}`,
);
console.log(
  `${(sum("before") / 1048576).toFixed(0)} MB -> ${(sum("after") / 1048576).toFixed(0)} MB ` +
    `(${(100 - (sum("after") / sum("before")) * 100).toFixed(0)}% smaller)`,
);
for (const e of errors) console.warn(`  ERROR ${e.file}: ${e.error}`);

await writeFile(join(ROOT, "migration", "raw", "_optimise-report.json"), JSON.stringify(results, null, 2));
