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
| [Move the mailing list off Jetpack](docs/migrating-subscribers.md) | Migrate Adam's email subscribers off WordPress without losing anybody. |
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
recorded in `src/data/sidebar.json` under `subscribe.originalForm`, and setting
`subscribe.action` to a real endpoint is what switches it on.

This is the last thing that must be done before launch, because Adam's existing
subscribers live on WordPress.com and go away with it. The plan is
[issue #1](https://github.com/0xharkirat/adamcogan.com/issues/1), and the
procedure is [Move the mailing list off Jetpack](docs/migrating-subscribers.md).

**New comments.** The 175 existing comments are migrated and displayed. Posting
a new one needs Giscus configured, which takes Discussions enabled on this
repository and 4 values from [giscus.app](https://giscus.app). The repository is
public now, so the only remaining steps are those. See
[About the site's structure](docs/architecture.md#comments).

**Saving publishes straight away.** The CMS commits every save directly to
`main`, which triggers a rebuild and puts the change on the live site a few
minutes later. Every save is a publish, and the only way back is reverting the
commit. Anyone with CMS access is publishing rather than staging.

TinaCMS has an editorial workflow that commits to a branch and opens a pull
request instead. It is not set up here. Until it is, treat the editor as live.

**Visual editing is half working.** The CMS is meant to put the form on the left
and a live preview of the page on the right, so an editor sees the result as
they type. What it does instead:

- On an existing post, the preview loads and clicking the page still jumps to
  the right field, but typed changes reach it late or stall.
- On a new post, the form takes the full width and the preview appears only
  after the first save.

Under investigation, and parked until the editorial workflow above is set up.
That work changes how a save reaches the site, which is the layer the preview
depends on, so it is worth doing first rather than tuning the preview twice.
The forms are unaffected either way.

**A new post 404s until the build finishes.** Every page is built ahead of time,
so a post has no page to serve until the rebuild completes, usually 2 to 3
minutes. The CMS preview shows it immediately, which makes the gap look like a
failure. This resolves on its own.

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
