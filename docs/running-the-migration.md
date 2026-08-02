# Re-run the migration

Shows you how to rebuild the content, media and checks from the live WordPress
site. For what the migration did and why, see
[How this migration worked](how-the-migration-worked.md).

The scripts are numbered and idempotent, so running one twice gives the same
result as running it once.

## Prerequisites

- You have Node.js 22.22.0 or later and pnpm 10 or later.
- You have ffmpeg, which step 4 uses for video.
- adamcogan.com is reachable, because steps 1, 3, 5 and 6 read from it.

## Steps

Run the scripts in order:

```sh
node migration/scripts/1-extract.mjs        # WordPress REST API -> migration/raw/
node migration/scripts/2-transform.mjs      # raw JSON -> src/content/**/*.mdx
node migration/scripts/3-media.mjs          # download referenced uploads
node migration/scripts/4-optimise-media.mjs # resize, WebP, WebM
```

Build the site, then run the checks:

```sh
pnpm build:local
node migration/scripts/5-verify.mjs         # check the build against the live sitemap
node migration/scripts/6-content-diff.mjs   # compare every post's words against WordPress
```

## Order matters in one place

Run step 4 against freshly downloaded originals from step 3. Re-encoding its own
output loses quality for no size saving. Step 4 skips video that already has a
WebM sibling for this reason.

Step 2 resolves every media reference against the files on disk, so running it
after step 4 cannot leave content pointing at pre-WebP filenames.

## What the checks cover

`5-verify.mjs` needs a completed build. It fetches the live WordPress sitemap
and fails when any of the 183 post URLs is missing, when a migrated post has
moved off its address, when a date archive is absent, when a media reference has
no file, or when WordPress markup leaked into the output.

`6-content-diff.mjs` compares the words of every built post against the raw
WordPress HTML. Spot-checking pages cannot answer "did any of the 183 lose a
paragraph". This can, and it found 2 silent bugs that built cleanly. It reports
real loss separately from cases where the original's inline tags split a word,
so the output is not buried in false positives.

## Files that are not committed

`migration/raw/` and `migration/design/shots/` stay out of git. Step 1 recreates
the raw export, and the design capture is reference material.
