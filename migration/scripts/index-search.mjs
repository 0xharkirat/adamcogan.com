/**
 * Build the Pagefind index into whichever directory the host actually serves.
 *
 * This is not always `dist/client`. The Vercel adapter copies the static output
 * to `.vercel/output/static`, and that copy happens during `astro build`, which
 * finishes before this step runs. Indexing `dist/client` alone therefore
 * produced a perfectly good index in a directory Vercel never serves, and
 * `/search` returned nothing on the deployed site while working locally.
 *
 * Both locations are indexed when both exist, because `dist/client` is what a
 * local `astro preview` serves.
 */
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const CANDIDATES = [
  join(ROOT, ".vercel", "output", "static"),
  join(ROOT, "dist", "client"),
  // Netlify and the Node adapter both leave the static build here.
  join(ROOT, "dist"),
];

const exists = async (path) => {
  try {
    await access(join(path, "index.html"));
    return true;
  } catch {
    return false;
  }
};

const run = (site) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["--yes", "pagefind", "--site", site, "--output-path", join(site, "pagefind")],
      { stdio: "inherit", shell: false },
    );
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`pagefind exited ${code}`))));
  });

const targets = [];
for (const path of CANDIDATES) {
  if (await exists(path)) targets.push(path);
}

if (!targets.length) {
  console.error("index-search: no build output found. Run the build first.");
  process.exit(1);
}

for (const target of targets) {
  console.log(`\nindex-search: indexing ${target.replace(ROOT + "/", "")}`);
  await run(target);
}
