# Deploy to Vercel

Shows you how to configure a Vercel project for this site, and how to fix the
schema error that blocks the build.

## Prerequisites

- You have a TinaCloud project with this repository connected.
- You have the client id and token from [app.tina.io](https://app.tina.io).

## Configure the project

Set the build command to:

```sh
pnpm build
```

That runs the Tina build, the Astro build, and then the Pagefind index.

The adapter and `SITE_URL` need no configuration, because both are detected from
Vercel's own environment variables. Set `SITE_URL` only when absolute URLs in
the sitemap, feed and Open Graph tags should differ from the domain Vercel
reports.

Node is pinned to 22.22.0 in `.nvmrc`, which Vercel reads, so the version needs
no separate setting.

## Set the environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `TINA_CLIENT_ID` | yes | From app.tina.io. `PUBLIC_TINA_CLIENT_ID` also works. |
| `TINA_TOKEN` | yes | From app.tina.io. |
| `TINA_SEARCH_TOKEN` | no | Turns on search inside the CMS. A separate token, created under API Tokens. |
| `TINA_PUBLIC_IS_LOCAL` | never | Belongs in a local `.env` only. |

> [!WARNING]
> `TINA_PUBLIC_IS_LOCAL=true` forces the CMS to talk to a GraphQL server that
> `tinacms dev` runs on your machine. Set it on Vercel and the deployed `/admin`
> looks for a server that is not there.

## Verification

After the first deploy, check:

- The homepage lists posts.
- A post at its dated address, such as `/2026/07/29/ssws-homepage-receives-a-2026-facelift/`.
- `/search` returns results for a common word.
- `/admin/index.html` loads the CMS rather than an error.

## Troubleshooting

### The build fails with "the local Tina schema doesn't match the remote"

TinaCloud indexes the repository separately from Vercel building it, and the
build compares the 2 schemas. The message tells you to push to GitHub, which is
misleading when you already have.

There are 2 real causes.

**TinaCloud has not indexed your newest commit yet.** Vercel starts building the
moment you push. Redeploy once TinaCloud has caught up, or trigger a re-index
from its dashboard.

**`tina/tina-lock.json` is stale.** The lock file records the schema, and Tina
regenerates it during a build. Committing a change under `tina/` without the
regenerated lock guarantees this error. Always commit the 2 together.

To check the lock is current, run a local build and see whether git reports it
as modified:

```sh
pnpm build:local
git status --short tina/tina-lock.json
```

Anything reported means the committed lock is out of date.

> [!WARNING]
> Never make the Tina config depend on an environment variable. A block added or
> removed according to whether a variable is set changes the schema, so a lock
> committed from one machine can never match a build on another. This caused
> every deploy to fail until the search block was made unconditional.

### Search works locally but returns nothing when deployed

The Pagefind index has to be written into the directory the host serves. The
Vercel adapter copies the static output to `.vercel/output/static`, so an index
built only into `dist/client` is never served.

`migration/scripts/index-search.mjs` discovers the output directory and indexes
every location that exists. Run `pnpm run index-search` and confirm it reports
both paths.
