# adamcogan.com

The blog of Adam Cogan, migrated from WordPress to Astro and TinaCMS.

183 posts, 2 pages and 907 media files were moved off WordPress. Every post
keeps the permalink it had, so no inbound link to a site running since 2002 is
broken.

## Prerequisites

- Node.js 22.22.0 or later (`.nvmrc` pins the version)
- pnpm 10 or later
- ffmpeg, only if you re-run the media pipeline

## Run the site locally

Install dependencies:

```sh
pnpm install
```

Start the dev server, then edit visually at `localhost:4321/admin/`:

```sh
pnpm dev
```

Build the site and generate the search index:

```sh
pnpm build:local
```

> [!NOTE]
> If another TinaCMS project is already running, its dev server holds ports
> 4001 and 9000, and this build will silently query that project's content
> instead of failing. Pass `--port` and `--datalayer-port` to move ours:
> `npx tinacms build --local --skip-cloud-checks --port 4077 --datalayer-port 9077 -c "astro build"`

## How the site is put together

Content lives in `src/content/` as MDX and is edited through TinaCMS. Posts
carry `categories`, `tags`, `author`, and a `legacyUrl` recording the path the
post had on WordPress, which is what the verification step checks against.

URLs mirror WordPress exactly:

| Route | Path |
| --- | --- |
| Post | `/YYYY/MM/DD/<slug>/` |
| Listing | `/`, `/blog/`, then `/page/N/` |
| Category | `/category/<slug>/` |
| Tag | `/tag/<slug>/` |
| Year archive | `/YYYY/` |
| Feed | `/feed.xml`, with `/feed` and `/rss.xml` redirecting to it |

Categories and tags store WordPress slugs rather than display names, so those
archive URLs stay byte-identical. `src/data/taxonomy.json` maps each slug back
to its display name.

### Post dates are wall-clock values, not instants

Dates are stored as the local time WordPress published under, pinned to UTC,
and every route and component reads them back in UTC.

This looks wrong and is deliberate. WordPress exposes both `date` (site local)
and `date_gmt` (UTC), but `date_gmt` on this site is identical to local time
for 158 of the 183 posts, meaning no real GMT was ever recorded, while the
other 25 carry a true +10h offset. Treating that field as UTC moves posts
across day boundaries in both directions and breaks their permalinks. The local
`date` field matches the permalink for all 183 posts, so it is the only usable
source. The trade is that the absolute instant is off by the Sydney offset,
which nothing depends on.

## Re-running the migration

The scripts in `migration/scripts/` are numbered and idempotent. They exist so
the migration can be repeated rather than being a one-time manual effort.

```sh
node migration/scripts/1-extract.mjs        # WordPress REST API -> migration/raw/
node migration/scripts/2-transform.mjs      # raw JSON -> src/content/**/*.mdx
node migration/scripts/3-media.mjs          # download referenced uploads
node migration/scripts/4-optimise-media.mjs # resize, WebP, WebM
node migration/scripts/5-verify.mjs         # check the build against the live sitemap
```

`migration/raw/` and `migration/design/shots/` are not committed. Step 1
recreates the raw export; the design capture is reference material.

Run `2-transform.mjs` and `3-media.mjs` before `4-optimise-media.mjs`, and run
step 4 against freshly downloaded originals. Re-encoding its own output loses
quality for no size benefit. The transform re-applies the renames recorded in
`migration/raw/_optimise-report.json`, so running it again cannot leave content
pointing at pre-WebP filenames.

`5-verify.mjs` needs a completed build in `dist/`. It fetches the live
WordPress sitemap and fails if any of the 183 post URLs is missing, if any
dated URL was invented, if any media reference has no file, or if WordPress
markup leaked into the output.

## Deployment

The site targets Vercel and detects the adapter from the platform's own
environment variables, so there is nothing to configure. Set `SITE_URL` if you
need absolute URLs (sitemap, feed, Open Graph) to differ from what the platform
reports.

`pnpm build` runs the Tina build, the Astro build, and then the Pagefind index.
Skipping the index step does not fail the build; search just returns nothing.

## Known gaps

- **Subscribe form.** The original posts to Jetpack, which validates a
  single-use nonce server-side. There is no external endpoint to copy, so the
  form renders with no action and a TODO. The original form contract is
  recorded in `src/data/sidebar.json` under `subscribe.originalForm`. This
  needs a real mailing list (Mailchimp, Buttondown, or similar) before launch.
- **Comments.** WordPress comments were not migrated. Adding Giscus or a
  similar service is a separate decision.
- **Images.** Images were resized to a 2000px long edge and re-encoded, which
  is lossy. The originals are still on the WordPress host and `3-media.mjs`
  re-fetches them, so this is reversible until that host is switched off.
