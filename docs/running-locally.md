# Run the site locally

Shows you how to start the site and the CMS on your own machine, and how to get
out of the 2 states that most often look broken.

To write posts rather than code, see [Write and edit posts](writing-posts.md).

## Prerequisites

- You have Node.js 22.22.0 or later. `.nvmrc` pins the version.
- You have pnpm 10 or later.
- You have ffmpeg, if you plan to re-run the media pipeline.

## Start the site

Install dependencies:

```sh
pnpm install
```

Start the dev server:

```sh
pnpm dev
```

The site runs at `localhost:4321` and the CMS at `localhost:4321/admin/index.html`.

To build the site and its search index without contacting TinaCloud:

```sh
pnpm build:local
```

## Fix the TinaCloud login screen

`/admin` works only while `pnpm dev` is running. In local mode the CMS talks to
a GraphQL server that `tinacms dev` starts, and that server is not part of the
static output.

If you see "Log in with TinaCloud" instead of "You are in local mode":

1. Reload the page fully. Changing the part of the URL after `#` does not
   re-fetch anything, so a stale page survives it.
2. If the screen persists, restart `pnpm dev`.

The underlying cause is that `public/admin/` is generated. `tinacms dev` writes
a local-mode CMS there, and `tinacms build` overwrites it with the cloud-mode
one. Any build run while the dev server is up brings the login screen back until
you restart. The `--local` flag does not prevent this: it controls where the
build reads content, not how the CMS authenticates.

## Run alongside another TinaCMS project

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

That starts Tina on 4077, the datalayer on 9077, and the site on 4399.
