# About the site's structure

Explains how content, URLs and dates fit together, and why some of it is shaped
the way it is. For the steps to run or deploy the site, see
[Run the site locally](running-locally.md) and [Deploy to Vercel](deployment.md).

## Content

Content lives in `src/content/` as MDX and is edited through TinaCMS. Posts
carry `categories`, `tags`, `author`, and a `legacyUrl` recording the path the
post had on WordPress, which is what the verification step checks against.

## URLs

Every route mirrors WordPress:

| Route | Path |
| --- | --- |
| Post | `/YYYY/MM/DD/<slug>/` |
| Listing | `/`, `/blog/`, then `/page/N/` |
| Category | `/category/<slug>/` |
| Tag | `/tag/<slug>/` |
| Date archives | `/YYYY/`, `/YYYY/MM/`, `/YYYY/MM/DD/` |
| Search | `/search`, built by Pagefind |
| Feed | `/feed.xml`, with `/feed` and `/rss.xml` redirecting to it |

`/blog/<slug>` redirects to the dated permalink. Nothing on the site links
there. It exists because the CMS falls back to that shape for a post it has
created but whose date it does not yet know.

## Categories and tags

Both are free text, so an editor can add one. Values are slugified when URLs are
built, which leaves the migrated WordPress slugs byte-identical, because
slugifying a slug changes nothing. A term typed as "AI Agents" files under
`/category/ai-agents/`. `src/data/taxonomy.json` maps the original slugs back to
their WordPress display names.

## Post dates are wall-clock values, not instants

Dates are stored as the local time WordPress published under, pinned to UTC, and
every route and component reads them back in UTC.

This looks wrong and is deliberate. WordPress exposes both `date` (site local)
and `date_gmt` (UTC). On this site `date_gmt` is identical to local time for 158
of the 183 posts, meaning no real GMT was ever recorded, while the other 25
carry a true +10h offset. Treating that field as UTC moves posts across day
boundaries in both directions and breaks their permalinks. The local `date`
field matches the permalink for all 183 posts, so it is the only usable source.
The trade is that the absolute instant is off by the Sydney offset, which
nothing depends on.

## Comments

All 175 approved WordPress comments are migrated into `src/data/comments.json`
and render under each post with their original author names, dates and
threading. They are read-only history rather than editable content, so they live
in a data file rather than a Tina collection.

They are deliberately not imported into Giscus. Giscus stores comments as GitHub
Discussion replies, so an import would re-attribute all 175 to whichever account
ran it, losing 154 real commenters. The archive keeps the record, and Giscus
handles new comments underneath it.

Comment bodies are third-party HTML, so they are reduced once at migration time
to an inline-only tag set, with every attribute except a validated `http(s)`
href stripped. That is what makes rendering them with `set:html` safe. Do not
loosen `sanitise()` in `migration/scripts/lib/comments.mjs` without considering
what it protects.

## Reading from Tina

> [!WARNING]
> Tina connections are cursor-paginated, and `totalCount` reports the size of
> the page you asked for rather than the size of the collection. Querying
> `blogConnection { totalCount }` returns 50, not 183. Always page through
> `pageInfo.hasNextPage`, which is what `listAll()` in `src/lib/data.ts` does.
> Reading only the first page truncates the site silently: the build succeeds
> and 2 in 3 posts do not exist.
