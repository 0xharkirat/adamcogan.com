/**
 * Build a map of every image under public/media to its pixel dimensions.
 *
 * Images are referenced from Markdown (`![alt](src)`) and from `<Figure />`,
 * and neither carries width/height. Without them the browser cannot reserve
 * space, so the page reflows as each image decodes. Rather than stamping
 * dimensions into 800 content references, the sizes are looked up at render
 * time from this map, which means content stays clean and re-running the
 * optimiser cannot leave stale numbers behind.
 */
import { readdir, writeFile } from "node:fs/promises";
import { join, extname, relative } from "node:path";
import sharp from "sharp";

const SIZED = new Set([".webp", ".png", ".jpg", ".jpeg", ".gif", ".avif"]);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

export async function buildMediaSizes(publicDir, outFile) {
  const mediaDir = join(publicDir, "media");
  const files = (await walk(mediaDir)).filter((f) => SIZED.has(extname(f).toLowerCase()));

  const sizes = {};
  let failed = 0;

  await Promise.all(
    files.map(async (file) => {
      try {
        const { width, height, pageHeight } = await sharp(file).metadata();
        if (!width || !height) return;
        // Animated WebP stacks frames vertically in `height`; `pageHeight` is
        // the real frame height, so using `height` would reserve space for
        // every frame at once.
        const displayHeight = pageHeight ?? height;
        sizes[`/${relative(publicDir, file).split(/[\\/]/).join("/")}`] = [width, displayHeight];
      } catch {
        failed += 1;
      }
    }),
  );

  const ordered = Object.fromEntries(Object.entries(sizes).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(outFile, JSON.stringify(ordered));
  return { count: Object.keys(ordered).length, failed };
}
