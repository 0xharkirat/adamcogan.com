# adamcogan.com

Adam Cogan's blog, migrated from WordPress to Astro and TinaCMS.

The move brought over 183 posts, 2 pages, 910 media files and 175 comments.
Every post keeps the address it had, so links pointing at a site running since
2002 still resolve.

Live at <https://adamcogan.vercel.app>, edited at
<https://adamcogan.vercel.app/admin>.

Migrated to [TinaCMS](https://tina.io) by [Harky](https://harksingh.com) with ❤️.

Built with Claude Code and Playwright MCP, driving a deterministic migration
script, so every run produces the same output. See
[How this migration worked](docs/how-the-migration-worked.md).

## Table of contents

- [Documentation](#documentation)
- [Install](#install)
- [Usage](#usage)
- [Known gaps](#known-gaps)
- [License](#license)

## Documentation

| Read this | If you want to |
| --- | --- |
| [Write and edit posts](docs/writing-posts.md) | Write a post in the browser at `/admin`. Assumes no coding, and explains how a post's address is built. |
| [Run the site locally](docs/running-locally.md) | Start the site and CMS, or fix the TinaCloud login screen. |
| [Deploy to Vercel](docs/deployment.md) | Set up hosting, or fix a failing build. |
| [About the site's structure](docs/architecture.md) | Understand the URLs, dates, taxonomy and comments. |
| [Re-run the migration](docs/running-the-migration.md) | Rebuild the content from WordPress. |
| [How this migration worked](docs/how-the-migration-worked.md) | Follow the whole process. Written for a general reader. |

## Install

```sh
pnpm install
```

Node.js 22.22.0 or later, pinned in `.nvmrc`. pnpm 10 or later.

## Usage

Start the site and the CMS:

```sh
pnpm dev
```

The site runs at `localhost:4321`, the CMS at `localhost:4321/admin/index.html`.

Build the site and its search index:

```sh
pnpm build
```

`pnpm build:local` does the same without contacting TinaCloud. `pnpm dev:alt`
and `pnpm build:alt` use alternative ports, for when another TinaCMS project
holds the defaults.

## Known gaps

**Subscribe form.** The original posts to Jetpack, which validates a single-use
nonce on the server. There is no endpoint to copy, so the form tells the reader
it is not connected rather than failing silently. The original form contract is
recorded in `src/data/sidebar.json` under `subscribe.originalForm`. This needs a
mailing list before launch.

**New comments.** The 175 existing comments are migrated and displayed. Posting
a new one needs Giscus configured, which takes a public GitHub repository with
Discussions enabled and 4 values from [giscus.app](https://giscus.app). See
[About the site's structure](docs/architecture.md#comments).

**Image quality.** Images were resized to a 2000px long edge and re-encoded,
which is lossy. The originals remain on the WordPress host and
`migration/scripts/3-media.mjs` re-fetches them, so this is reversible until
that host is switched off.

**The design is the old one, on purpose.** The layout, type, colours and spacing
were measured off the WordPress site and rebuilt to match, down to details that
look like mistakes: the wordmark's line height, links marked only by a grey
underline, unstyled code blocks, and pagination where the current page is the
unfilled chip. The migration was judged on whether readers notice a change, so
redesigning it at the same time would have made that impossible to tell. Adam
can now change any of it, against a version that is known to match what he had.
See [About the site's structure](docs/architecture.md).

## License

Code is unlicensed. The posts, images and comments are Adam Cogan's.
