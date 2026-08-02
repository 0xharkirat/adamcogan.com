# Run the site locally

Shows you how to get the site and the CMS running on your own machine, and how
to get out of the states that most often look broken.

To write posts rather than code, use the hosted editor instead. See
[Write and edit posts](writing-posts.md).

## Prerequisites

- You have Node.js 22.22.0 or later. `.nvmrc` pins the version.
- You have pnpm 10 or later.
- You have ffmpeg, if you plan to re-run the media pipeline.
- You have TinaCloud credentials, if you plan to run a production build.

## Install

```sh
git clone https://github.com/0xharkirat/adamcogan.com.git
cd adamcogan.com
pnpm install
```

## Set up the environment

Copy the example file:

```sh
cp .env.example .env
```

For editing content locally, one line is enough:

```sh
TINA_PUBLIC_IS_LOCAL=true
```

That runs the CMS against a GraphQL server on your machine, so you can edit
without touching TinaCloud or the live content.

Add the TinaCloud values when you need to run a production build:

| Variable | Needed for | Where it comes from |
| --- | --- | --- |
| `TINA_CLIENT_ID` | `pnpm build` | [app.tina.io](https://app.tina.io) |
| `TINA_TOKEN` | `pnpm build` | app.tina.io |
| `TINA_SEARCH_TOKEN` | Search inside the CMS | app.tina.io, under API Tokens |

`.env` is gitignored. Keep it that way.

> [!WARNING]
> `TINA_PUBLIC_IS_LOCAL` belongs in your local `.env` only. Setting it on a host
> points the deployed `/admin` at a server that exists on your laptop.

## Start the site

```sh
pnpm dev
```

The site runs at `localhost:4321`, and the CMS at
`localhost:4321/admin/index.html`.

### Verification

- `localhost:4321` lists posts.
- `localhost:4321/admin/index.html` shows "You are in local mode" in the top
  left, with no login prompt.
- A post opens at its dated address, such as
  `localhost:4321/2026/07/29/ssws-homepage-receives-a-2026-facelift/`.

## Build

To build the site and its search index without contacting TinaCloud:

```sh
pnpm build:local
```

To run the build exactly as the host does, which checks your schema against
TinaCloud:

```sh
pnpm build
```

Both write to `dist/`, and `pnpm build` also writes the host's own output
directory.

## Where things live

| Path | Holds |
| --- | --- |
| `src/content/blog/` | One MDX file per post |
| `src/content/page/` | Standalone pages |
| `src/data/` | Generated data: comments, taxonomy, image sizes |
| `src/pages/` | Routes |
| `tina/collections/` | The CMS schema |
| `migration/scripts/` | The numbered migration and verification scripts |
| `public/media/` | Images and video |

For why the routes and dates are shaped the way they are, see
[About the site's structure](architecture.md).

## Check your changes

After a build:

```sh
node migration/scripts/5-verify.mjs        # URLs, media, comments, leftovers
node migration/scripts/6-content-diff.mjs  # every post's words against WordPress
```

Run both before pushing anything that touches content, routes or the migration
scripts. See [Re-run the migration](running-the-migration.md).

## Troubleshooting

### The CMS asks you to log in

`/admin` works only while `pnpm dev` is running. In local mode the CMS talks to
a GraphQL server that `tinacms dev` starts, and that server is not part of the
static output.

If you see "Log in with TinaCMS" instead of "You are in local mode":

1. Reload the page fully. Changing the part of the URL after `#` does not
   re-fetch anything, so a stale page survives it.
2. If the screen persists, restart `pnpm dev`.

The cause is that `public/admin/` is generated. `tinacms dev` writes a
local-mode CMS there, and `tinacms build` overwrites it with the cloud-mode one.
Any build run while the dev server is up brings the login screen back until you
restart. The `--local` flag does not prevent this: it controls where the build
reads content, not how the CMS authenticates.

### Saving fails with "Failed to fetch"

The Tina process has stopped while the Astro one kept going, so the site still
serves and only saving breaks. Restart `pnpm dev`.

### A new post returns "Page not found"

Restart `pnpm dev`. If it happens on the deployed site instead, the build has
not finished yet.

### Another TinaCMS project is already running

Tina defaults to ports 4001 for GraphQL and 9000 for the datalayer, and Astro
defaults to 4321. All 3 are global, so a second project holding them causes 2
different failures:

- `pnpm dev` fails with "Tina Dev server is already in use".
- `tinacms build` does not fail. It queries the other project's schema, and the
  build breaks later with errors naming collections this site has never had.

Either stop the other dev server, or run this one on its own ports:

```sh
pnpm dev:alt
```

That starts Tina on 4077, the datalayer on 9077, and the site on 4399. There is
a matching `pnpm build:alt`.
