# Rebuild vs original: visual and structural diff

Reviewed `https://adamcogan.com` against the static production build served at `http://localhost:4325` (port 4399 was not listening, so everything below is from 4325).
Breakpoints 1440, 768 and 390.
Screenshots and element crops are in `migration/design/diff/`.

Note on timing: `dist/client` was rebuilt twice while this review was running (22:47 and 23:28 local).
Every number reported here was re-measured against the build that was on disk after those rebuilds.

## Verdict

The rebuild is close.
Structure, container widths, colours, nav geometry, link treatment, caption chips, pagination chips and the entire sidebar are effectively pixel-identical, and the sidebar in particular is a 1:1 height match down to the pixel (4180px on both).
What separates it from the original is not layout, it is weight and rhythm.
Every bold heading on the site renders at 600 instead of 700, which makes the whole rebuild read one notch lighter and slightly softer than Adam's site when you flip between the two.
On top of that, three content-fidelity problems will be obvious to Adam if he lands on the wrong page: the 2011 gallery post has been flattened from a compact two-column contact sheet into six full-bleed photos, the About page testimonial blockquote has lost its paragraph breaks and now reads as one wall of italic text, and one figure on the 2026 post is served from a badly downsampled source that no longer fills the column.
Fix the heading weight, the blockquote and the gallery, and the rest is nitpicking.

---

## Blocker

### B1. Every bold heading renders semibold (600) instead of bold (700)

**Pages:** all. **Breakpoints:** all.

| Element | Original | Rebuild |
|---|---|---|
| Wordmark `ADAM COGAN` | `font-weight: 700` | `600` |
| Post title `h2` (list) 26px | `700` | `600` |
| Post title `h1` (single) 26px | `700` | `600` |
| In-content `h4` 22.4px | `700` | `600` |
| `figcaption` 16px | `700` | `600` |
| Sidebar widget title 19.2px | `700` | `600` |
| Archive `h1` 32px | `700` | `600` |

Every other metric on these elements matches exactly (size, line-height, margins, colour).
It is only the weight.

Likely cause: a global heading weight token set to `600`, or `font-semibold` used where the theme expects `font-bold`.
The rebuild loads `Open Sans Variable` (300 to 800), so 700 is available and no font swap is needed.

This is the single highest-value fix. It touches every page and it is what makes the rebuild look slightly "off brand" side by side.

### B2. The 2011 gallery post is flattened from a 2-column gallery into a stack of full-width photos

**Page:** `/2011/07/18/juval-lowy-visits-ssw/`. **Breakpoint:** 1440 (and below).

| Measure | Original | Rebuild |
|---|---|---|
| Gallery container | `div.gallery` 665 x 857 | six separate `<figure>` blocks |
| Image size | 150 x 150 thumbnails, 2 per row | 663 x 444, one per row |
| Caption width | 333px (half column) | 663px (full column) |
| Caption type | 15.2px / 18.24px / 700 | 16px / 24px / 600 |
| Entry content height | 1251px | 3199px |

See `gallery-1440-original.png` next to `post-2011-1440-rebuild.png`.

Cause: the WordPress `[gallery]` shortcode was expanded into individual images during migration, and there is no gallery or grid component on the rebuild side.
The photos genuinely look better big, but this is a design decision the site owner has not made, it changes the reading experience of a legacy post from a contact sheet into a long photo scroll, and it will apply to every old post that used `[gallery]`.
Worth confirming how many posts are affected before deciding.

### B3. About page blockquote has lost all its paragraph breaks

**Page:** `/about-adam-cogan/`. **Breakpoints:** all.

| Measure | Original | Rebuild |
|---|---|---|
| Blockquote children | 5 x `<p>`, each with `margin-bottom: 21.12px` | zero element children |
| Block height | 380px | 229px |
| Rendered text | five separate quotes | one continuous run |

The rebuild renders `...closest thing to a Geek rock star”“I enjoy Adam's presentations...` with no break between quotes.
Five distinct testimonials now read as a single paragraph.
Font size (17.6px), line-height (22.88px), italic style and 30px left padding all match, so it is only the paragraph structure that was lost, most likely in the HTML to markdown conversion.

---

## Should fix

### S1. Vertical rhythm between post list items is 19px tighter

**Pages:** homepage, category archive. **Breakpoint:** 1440 (proportionally the same below).

| Measure | Original | Rebuild |
|---|---|---|
| Bottom of excerpt text to top of next post | 59px | 40px |
| Article `margin-bottom` | 40px | 40px |
| Last `<p>` `margin-bottom` | 19.2px, applied | 19.2px, collapsed away |

Cause: `article.mb-10` has no padding, border or containment, so the last paragraph's `1.2rem` bottom margin collapses into the article margin and `max(40, 19.2)` wins.
The original theme's `.post.tf_clearfix` blocks margin collapse, so both values apply.

Across a 10-post page this accounts for roughly 190px of the total height difference and makes the list feel denser than the original.

### S2. All 0.9em text uses `line-height: 21.6px` instead of 24px

**Pages:** all. **Breakpoints:** all.

| Element | Original | Rebuild |
|---|---|---|
| Post meta line (14.4px) | `line-height: 24px` | `21.6px` |
| Two-line meta block height | 48px | 43.19px |
| Footer text (14.4px) | `24px` | `21.6px` |

The original theme inherits an absolute 24px line-height, so 14.4px text keeps the 24px baseline.
The rebuild uses `leading-normal` (1.5), which gives 21.6px.
The meta line reads visibly tighter than the original, and it breaks the 24px vertical rhythm the rest of the page is on.

### S3. Tall comparison image on the 2026 post is downsampled and does not fill the column

**Page:** `/2026/07/29/ssws-homepage-receives-a-2026-facelift/`. **Breakpoint:** 1440.

| Measure | Original | Rebuild |
|---|---|---|
| Source image | 1440 x 4772 (`Comparisonv2.png`) | 604 x 2000 (`Comparisonv2.webp`) |
| Rendered width | 665px (full column) | 614px |
| Figure width | 665px | 652px |
| Caption overhang past the image | 0px | 38px |

The other three figures on this page render at the full 663px and are fine.
This one was re-encoded at 604px wide, so it is 2.4x lower resolution than the original for an image whose entire point is comparing fine screenshot detail, and because the figure is width-fit it also ends up narrower than every other image on the page with a grey caption bar sticking out 38px past the photo.

### S4. Figure caption bars can be wider than the image they belong to

**Page:** `/about-adam-cogan/`. **Breakpoint:** 1440 (not visible at 390, where images fill the column).

| Measure | Original | Rebuild |
|---|---|---|
| Image block width | 380px, exactly the image width | figure 568px, image 390px |
| Caption overhang | 0px | 178px |
| Caption alignment | `center` | `start` |

See `about-figure-1440-original.png` next to `about-figure-1440-rebuild.png`.
The grey caption strip is sized by the caption text rather than by the image, so it juts out well past the right edge of the photo.
The original always matches the caption strip to the image width and centres the text inside it.

Same root cause as the overhang in S3.

### S5. Prev/next post navigation is missing on post pages

**Page:** `/2026/07/29/...` and presumably every post. **Breakpoint:** all.

The original renders `div.post-nav` (102px tall) between the article and the comment form, with the adjacent post title, for example `« North Sydney Council Approves Critical Safety Link: Military Road Pedestrian Overpass Project`.
The rebuild goes straight from the article to the Comments section.
This is separate from the comments work, so it will not come back on its own.

### S6. Masthead vertical rhythm is compressed

**Breakpoint:** 1440. See `header-1440-original.png` next to `header-1440-rebuild.png`.

| Element | Original | Rebuild | Delta |
|---|---|---|---|
| Avatar top | y=32 | y=22 | 10px higher |
| Tagline top | y=96 | y=76 | 20px higher |
| Nav top | y=146 | y=150 | 4px lower |
| Header total height | 197px | 198px | matches |

The header box is the right height, but the contents sit differently inside it.
The tagline crowds up under the wordmark and the gap between the tagline and the nav row grows by 20px, which leaves an odd empty band in the middle of the masthead.

### S7. Header RSS link is smaller and sits 32px lower

**Breakpoint:** 1440.

| Measure | Original | Rebuild |
|---|---|---|
| Position | 1145, 136 | 1154, 168 |
| Block size | 57 x 28 | 48 x 20 |
| Icon | filled orange rounded-square RSS glyph, 30 x 28, `rgb(249,164,71)` | thin outline RSS glyph, ~16px |
| Label size | 16px | 14px |

In the original the RSS icon is a solid orange badge sitting roughly level with the nav row.
In the rebuild it is a thin line icon dropped below the nav baseline.
This is one of the details that reads as "cheaper" in a side-by-side.

### S8. At 768 the header loses 35px and the hamburger moves to the top right

**Breakpoint:** 768. See `home-768-original.png` next to `home-768-rebuild.png`.

| Measure | Original | Rebuild |
|---|---|---|
| Header height | 209px | 174px |
| Hamburger position | 677, 146 (same row as RSS, bottom right) | 677, 22 (top right, level with the wordmark) |
| Hamburger chip | light grey rounded background | no background |

### S9. At 390 the wordmark drops from 60px to 36px

**Breakpoint:** 390. See `home-390-original.png` next to `home-390-rebuild.png`.

| Measure | Original | Rebuild |
|---|---|---|
| Wordmark `font-size` | 60px | 36px |
| Wordmark box | 212 x 136 (wraps to two big lines) | 238 x 72 |
| Header height | 304px | 246px |

This is the most visible mobile difference.
The original's masthead is dominated by a large two-line `ADAM COGAN`; the rebuild's is a comparatively small label.

### S10. Column gap is a fixed 54px instead of a percentage

**Breakpoints:** 768 and below.

| Measure | Original | Rebuild |
|---|---|---|
| Gap at 1440 | 53.16px | 54.00px (fine) |
| Gap at 768 | 41px | 54px |
| Main column at 768 | 459px | 446px (13px narrower) |

The original theme uses a percentage margin, so the gutter shrinks with the viewport.
`gap-x-[54px]` is correct at 1440 and steals 13px from the reading column at 768.

### S11. Sidebar is 3px narrow and stops 4.5px short of the right margin

**Breakpoint:** 1440.

| Measure | Original | Rebuild |
|---|---|---|
| Main column width | 665.04px | 663.08px |
| Sidebar width | 259.16px | 256.23px |
| Sidebar right edge | 1201.36px | 1196.81px |
| Container right edge | 1202px | 1202px |
| Footer text right edge | 1201px | 1201px |

The original's sidebar lines up with the container and with the footer's right-hand text.
The rebuild's stops 4.5px short, so the right edge of the page is slightly ragged: sidebar at 1196.8, footer text at 1201.
`67.8% + 54px + 26.2%` only adds up to 973.3 of the available 978.

### S12. Footer is 28px shorter and the back-to-top arrow is a thin chevron

**Breakpoint:** 1440. See `footer-1440-original.png` next to `footer-1440-rebuild.png`.

| Measure | Original | Rebuild |
|---|---|---|
| Footer wrapper height | 157px | 128.79px |
| `.back-top` block height | 40px | 30px |
| Arrow glyph | filled, heavy up-arrow | thin chevron |
| Left credit line-height | 40px | 21.6px |

The 30px black circle matches, but the glyph inside it is much lighter in the rebuild.
The 28px height loss is 10px from the back-to-top block and 18px from the credit line-height.
The original's left credit sits lower than its right credit because of that 40px line-height; the rebuild aligns both, which is arguably better but is a difference.

---

## Nitpick

- **N1. Content images have `border-radius: 4px`.** Original is `0px` everywhere. Affects every in-content image on every post.
- **N2. Nested list bullets are `disc` at level 2.** Original renders hollow `circle` markers for the second level, which gives the nesting visual hierarchy. Seen on `/about-adam-cogan/`.
- **N3. About page captions are left-aligned.** Original centres captions inside `.wp-block-image` (About) while left-aligning `size-large` and `size-full` captions (2026 post). The rebuild left-aligns everything.
- **N4. Gallery captions use the standard caption size.** Original gallery captions are 15.2px / 18.24px; the rebuild uses 16px / 24px for all captions.
- **N5. Excerpts are hard-capped at 300 characters.** Homepage post 2 is 411 characters in the original, 300 in the rebuild. Posts 1, 3 and 4 match exactly.
- **N6. Page titles drop the site suffix.** `SSW's homepage receives a 2026 facelift! - Adam Cogan` becomes `SSW's homepage receives a 2026 facelift!`; `General Archives - Adam Cogan` becomes `General`; the homepage `Adam Cogan - Microsoft Regional Director | Scrum Master | Speaker` becomes `Adam Cogan`. SEO rather than visual, but worth a decision.
- **N7. Pagination has no jump-to-last control.** Original shows `1 2 3 4 › »`; the rebuild shows `1 2 3 … 12 ›`. Both resolve to 12 pages, and the chip styling (24 x 24 black circles, current page plain) matches exactly.
- **N8. Jetpack "Related" block is not ported.** 171px block at the end of each post in the original. Third-party widget, low severity.
- **N9. Featured image sits 5px closer to the date.** Original leaves 251px from article top to date; the rebuild leaves 245px, because the original's `<figure>` carries a 6px inline gap under the image.
- **N10. Post pages use `<span>` for the date, the homepage uses `<time>`.** Semantic inconsistency only, no visual effect.

---

## Checked and matching

These were measured on both sides and are equivalent, so they need no attention.

- Red top bar: `6px solid rgb(204, 65, 65)` on both. Header band `rgb(245, 245, 245)` on both.
- Container: 978px max width, centred, identical left edge at x=224 at 1440.
- Content column top padding: 48.9px on both. Bottom padding 29.34px on both.
- Nav: same four items, identical computed positions (224 / 301 / 390 / 529), 16px, `uppercase`, line-height 22.4px, colour `#333`.
- Body: Open Sans, 16px / 24px, `rgb(51,51,51)` on `rgb(255,255,255)`, both.
- Post title 26px / 33.8px with 5px bottom margin; date 16px / 24px; excerpt 16px / 24px with 19.2px bottom margin. All identical.
- In-content `h4`: 22.4px / 29.12px, 8.96px bottom margin. Identical apart from weight.
- Body links: `rgb(51,51,51)` with `rgb(204,204,204)` underline. Exact match, including inside meta lines.
- Figure captions: background `rgb(245,245,245)`, padding `4px 8px`, 16px / 24px, 16px bottom margin. Exact match apart from weight.
- Meta separators: the original's `/` separators are reproduced faithfully, including the grey `#999` colour and spacing.
- Sidebar: the rebuild groups 21 WordPress widgets into 8 blocks, but every block height maps 1:1 (1489 / 49 / 365 / 124 / 875 / 743) with 30px gaps, and the total sidebar height is **4180px on both**. Widget titles 19.2px / 24.96px with 10px bottom margin.
- Footer: `border-top: 1px solid rgba(0,0,0,0.1)` with 30px vertical padding on both.
- Archive page: `h1` 32px / 32px with 12.8px bottom margin, first post 44px below it. Identical on both.
- 2026 post body: all content blocks map 1:1 (4 figures, 4 `h4`s, 2 lists, every paragraph), with block heights within ~2px of the original.
- No horizontal overflow in the rebuild at 768 or 390. The original actually overflows at both (`scrollWidth` 1290 at 768, 393 at 390, caused by an off-screen search label), so the rebuild is better here.
- No broken images anywhere in the rebuild across all five pages and all three breakpoints.
- No leftover starter-template content found (scanned for Astro, Lorem, placeholder, TODO, example.com, "Welcome to" and similar).

---

## Deliberate differences, confirmed not bugs

Per the review brief, and verified present as expected:

- Dark mode removed.
- Floating Facebook/Twitter/LinkedIn share rail not ported (visible in the original screenshots at 390 as a left-edge overlay).
- Footer right-hand text changed to "Migrated to TinaCMS by Harky with ❤️".
- X mark used where the original shows a Twitter bird.
- Sidebar badge images are real in the rebuild and lazy placeholders in some original screenshots.

One correction to the brief: the comment **count** is now present.
The rebuild's meta line renders `0 Comments` exactly like the original, and post pages carry a Comments section with "No comments on this post."
Only the comment bodies and the comment form are still missing, which is the expected mid-migration state.
Noted once, not repeated per page.
