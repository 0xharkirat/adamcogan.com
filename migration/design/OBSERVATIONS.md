# adamcogan.com visual design observations

Captured 1 August 2026 against the live WordPress site.
Companion files: `tokens.json` for exact values, `shots/` for full-page screenshots at 1440, 768 and 390 px.

The site runs the Themify "Basic" theme with the default skin.
Almost every visual decision below comes from either the theme's own stylesheet or a block of Customizer CSS stored in WordPress.
Where the two disagree, the Customizer CSS wins, and it usually does.

## The overall impression

This is a deliberately plain, text-first blog.
There is exactly one chromatic colour on the whole site (`#CC4141`, a muted brick red) and it appears in only three places: the 6px bar across the top of every page, the underline tint when you hover a link, and the back-to-top button's hover fill.
Everything else is `#333` text on white, with a `#F5F5F5` band behind the header.

Links are not blue.
They are the same `#333` as body text, distinguished only by a `#CCC` underline that warms to `#CC4141` on hover.
If you rebuild this and give links a colour, it will not look like the original.

There are no cards, no shadows outside the mobile menu panel, no rounded corners except on buttons and the pagination chips, and no dividers between post list items.
Vertical whitespace does all the separating.

## Page skeleton

Every page uses the same three-band structure.

```
#pagewrap
  #headerwrap        full-bleed, #F5F5F5, 6px #CC4141 border-top
    #header          .pagewidth container
      hgroup         avatar as background-image + wordmark + tagline
      #main-nav-wrap horizontal nav (or hamburger)
      .social-widget absolutely positioned RSS link, bottom-right of the header
  #body
    #layout          .pagewidth container
      #content       main column, float:left
      #sidebar       float:right
  #footerwrap
    #footer          .pagewidth container, 1px top rule
```

`.pagewidth` is the single container class and it is applied to the header, the layout and the footer.
It is `978px` wide, centred, and switches to `max-width: 90%` below 1100px.

## Desktop, 1440px

The container is 978px, centred, so there is 231px of empty page on each side.
Inside it the main column measures 665px (67.8%) and the sidebar 259px (26.2%), with a 54px gap between them.
Both columns get `padding: 5% 0 3%`, and because percentage padding resolves against the containing block, that computes to 48.89px top and 29.33px bottom at this width.

The header band is 198px tall.
The avatar is an 85px square black-and-white photo with hard corners, implemented as a `background-image` on the `<hgroup>` rather than an `<img>`.
The `<hgroup>` carries `padding-left: 100px` to clear it, which leaves a 15px gutter between the photo and the wordmark.

"ADAM COGAN" renders at 60px, uppercase, weight 700, letter-spacing -0.72px.
Its line-height is 40px, well under the font-size, so the glyph box deliberately overflows its line box.
That tight line-height is what makes the header compact.
If you set a normal line-height the header will grow noticeably taller than the original.

The tagline sits under it at 20px/20px with `margin: 10px 0 30px`.

The nav is a row of floated list items in uppercase 16px.
The items are spaced entirely by the link's own `padding-right: 30px` plus `margin-right: 5px`, with no left padding at all, so the row starts flush with the container's left edge.
The measured gap between adjacent link boxes is 5px, and the visual gap between one label's last letter and the next label's first letter is 35px.
There is no hover state on desktop nav links - not a colour change, not an underline, nothing.

The current menu item gets a dark `#333` pill with white text and a 5px radius.
There is a catch: the homepage and the blog listing set `.current_page_parent` on the Blog item, but the CSS only targets `.current_page_item` and `.current-menu-item`.
So on the homepage no nav item is highlighted at all, while on `/about-adam-cogan/` the About item does get the pill.
That is a bug in the original, and it is your call whether to reproduce it.

The RSS link is absolutely positioned to the bottom-right of the header, at roughly x=1152 in a 1440px viewport.
It is the only orange thing on the site (`#F9A447`).

## Tablet, 768px

This is the awkward one.

The theme has two relevant breakpoints and nothing between them.
At 1100px the container drops to `max-width: 90%` and the nav collapses to a hamburger.
At 760px the columns stack.
768px falls in the dead zone, so you get the mobile hamburger menu **and** a still-floated two-column layout.

The measured result at 768: container 678px, main column 459px, sidebar 178px, gap 41px.
A 178px sidebar is too narrow for the sponsor badge images and the search form, and the screenshot shows the badges shrinking and the search input becoming cramped.

This is worth fixing rather than reproducing.
A sensible rebuild stacks the sidebar at the same point the nav collapses, or introduces a breakpoint around 900px.

Two other things change at 1100px and therefore apply at 768:

- `.social-widget` goes `position: static; float: none; padding: 10px 0`, so the RSS link leaves the header's top-right corner and drops onto its own full-width row above the nav.
- The theme tries to shrink the wordmark to 30px, but the Customizer CSS uses the more specific selector `body #site-logo a` with `font-size: 60px`, which wins. The wordmark stays 60px at every breakpoint. Same for the avatar, which stays 85px everywhere.

## Mobile, 390px

The container is `max-width: 90%`, giving 338px of content with 19px of page margin on each side.

The sidebar stacks below the main content, full width, in the same source order.
That means a reader on mobile scrolls past the entire article, the post navigation and the comments before reaching the Subscribe box, the social icons, roughly eleven sponsor badge images, the search form, Adam's Profiles, Adam's Favourite Products, fourteen Recent Posts and twenty Archives entries.
On the homepage the sidebar alone is over 4,100px tall.
The full-page mobile screenshots are 10,000+ pixels tall largely because of this.

The wordmark stays at 60px and wraps onto two lines, "ADAM" then "COGAN", filling most of the screen height above the fold.
Combined with the 85px avatar and the tagline wrapping to three lines, the header consumes 306px before any content appears.

The nav becomes a hamburger.
The trigger is a 38x32 hit area on the right, drawn as three 2px black bars in a 20x14 box.
Tapping it adds `mobile_menu_active` to `<body>` and reveals a 200px white panel absolutely positioned at `top: 38px; right: 0`, with a 5px radius, `0 0 0 1px rgba(0,0,0,0.2), 0 2px 12px rgba(0,0,0,0.15)` shadow, 5px vertical padding and `max-height: 70vh` with scroll.
Links inside the panel are `#666`, 16px, `padding: 6px 14px`, and lose the uppercase transform.
The active item keeps its dark pill.
See `shots/nav-open-390.png`.

The footer's two credit blocks stack, left block first.

One real defect: on single posts and pages a floating share sidebar (Facebook, Twitter, LinkedIn) is pinned to the left edge of the viewport by a plugin.
At desktop it sits harmlessly in the empty left margin.
At 390px it overlaps the article text - you can see it covering the "About" heading and the first paragraphs in `shots/about-390.png`.
Do not port this as-is.

## Post list items

Each item is `article.post` with `margin-bottom: 40px` and no border or divider.
The structure is: featured image, then date, then title, then meta line, then excerpt.

The featured image is a fixed 670x241 WordPress thumbnail (2.78:1) rendered at the full column width, so 665x239 at desktop.
No border, no radius.
Posts without a featured image simply start at the date line, and the list handles the mix without any layout compensation.

The date is 16px `#333` - the same size and colour as body copy, not dimmed or shrunk.
It is above the title, not below.

The title is `h2.post-title` at 26px/33.8px weight 700, with the anchor explicitly un-underlined.
Note that 26px is a hard pixel value from the Customizer and does not belong to the theme's em-based scale.

The meta line is 14.4px (0.9em) in the same `#333`, only smaller, and runs author, then categories, then tags, then comment count.
Category and tag links are comma-separated and underlined.
On tag-heavy posts this line wraps to two or three lines and is visually the busiest part of the card.

The excerpt is a plain 16px/24px paragraph, typically 3-4 lines.

Pagination sits at the bottom, right-aligned.
The chips are 24x24 circles.
Here is the odd part: the links get a black `#111` fill with white text, while the **current** page is the plain unfilled one.
That is the inverse of the usual convention, so double-check it before copying.

## Post pages

The single-post layout reuses the list item's markup almost exactly, keeping the featured image at the top and the same date / title / meta order.

The title is `h1.post-title` at 26px - the same size as a list item title, and smaller than a bare `<h1>` inside the body would be (32px).
Archive titles and page titles use `h1.page-title` at 32px.
So a category archive's heading is visibly larger than a post's own heading.
That inconsistency is in the original.

Body typography is a clean em scale off 16px: h1 32, h2 28.8, h3 25.6, h4 22.4, h5 19.2, h6 16, all weight 700, all `#333`.
Paragraphs are 16px/24px with a 19.2px bottom margin.
Lists indent 24px with 8px between items.

Two content treatments are distinctive and should survive the rebuild:

**Images in body copy** get `border: 1px solid #F5F5F5` plus `padding: 4px`, which reads as a subtle photo mat.
**Captions** are bold 16px on a `#F5F5F5` strip with `padding: 4px 8px`, flush against the bottom of the image with no gap.

**Blockquotes** switch to italic Times New Roman at 17.6px with `padding: 8px 30px 15px`.
No left rule, no background, no quote mark.
The font change is the entire treatment.

**Tables** use horizontal rules only, in `#ECEEEF` - 1px above each row, 2px under the header - with 12px cell padding and centred `<th>` text.
No vertical rules, no zebra striping, no header fill.

Neither a blockquote nor a table appears in the posts I sampled, so both were measured by injecting probe elements into a real `.entry-content` and reading the computed styles back.

## Code blocks - the biggest surprise

Code blocks are completely unstyled.

`pre.wp-block-code` has no background, no padding, no border, no radius and no syntax highlighting.
It renders as browser-default monospace at 13px, `#333`, sitting directly on the white page.
Verified visually on the .NET Aspire post - see `shots/post-code-1440.png`.
The markup is also malformed there, with a `<code>` nested inside another `<code>`.

There is a complication.
The Highlighting Code Block plugin is installed and its stylesheet loads on every page, giving properly styled blocks: `#f8f6f6` background, `#1f1e1e` text, Menlo/Consolas, 14px, `1.75em / 1.5em` padding, 3px radius, optional line numbers and a language label.
No post I sampled actually uses it.

So before building, grep the exported content for `hcb_wrap`.
If some older posts use the plugin and newer ones use plain `wp-block-code`, the migration has two code-block treatments to reconcile, and the sensible move is to pick one and normalise everything to it.
The plugin's values are recorded in `tokens.json` under `postPage.codeBlocks.highlightingCodeBlockPlugin`.

## Sidebar

The sidebar is 259px at desktop and identical on every page type, including the About page.

Widgets are separated by a flat 30px margin.
There is no background, no border and no card treatment on widgets.
Widget headings are 19.2px weight 700, sentence case, **not** uppercase, with no rule underneath.

Only one widget has a divider: the social-icons block carries an extra `.borderbottom` class giving it `border-bottom: 1px solid #DDD`.
That is a one-off, not a pattern.

Two different heading levels do the same job - `h4.widgettitle` for classic widgets and `h5.wp-block-heading` for block widgets - but both compute to 19.2px/700, so they look identical.
Worth normalising to one element in the rebuild.

The visible widget titles in order are: Subscribe via email, then the untitled social icons row, then eleven untitled sponsor badge images, then an untitled search form, then Adam's Profiles, Adam's Favourite Products, Recent Posts and Archives.
Four sidebar widgets render at zero height because they are empty.

The Subscribe button and the Search button share a fill (`#32373C`), a text colour, a font size and padding, but the Subscribe button is a full pill (`border-radius: 9999px`) while the Search button is a 5px rounded rectangle.
Both radii come from WordPress core block defaults rather than the theme, which is why they disagree.
They sit about 1,600px apart vertically so the inconsistency is not obvious in use, but it is there.

## Footer

The footer is white, not dark, separated from the content only by a 1px `rgba(0,0,0,0.1)` rule.
It has `padding: 30px 0` and stands 157px tall at desktop.

A 30px black circular back-to-top button sits above the credit line, floated left.
It hovers to `#CC4141` - one of the three places the accent red appears.
It is in the document flow inside the footer, not fixed to the viewport.

The credit line is 14.4px `#333`, split into two floated blocks:

- Left: `© Adam Cogan 2026` (the name links to the site root, the year is dynamic)
- Right: `Powered by WordPress | Built by SSW` (SSW links to ssw.com.au)

At 390px they stack, left block first.

## Fonts

Open Sans throughout, with one important caveat.

The computed `font-family` is the bare string `"Open Sans"` with **no fallback stack**, which is fragile.
Add a real stack in the rebuild.

More significantly, only four faces are actually loaded: 400 normal, 400 italic, 600 normal, 600 italic.
But the CSS asks for `font-weight: 700` on the wordmark, every heading, every post title and every widget title.
With no 700 face available the browser falls back to the 600 face.

So everything the CSS calls "bold" is really Open Sans SemiBold.
If you load a genuine 700 face in the rebuild, all headings and the wordmark will render heavier than the original.
Either load 400 and 600 only and map `font-bold` to 600, or accept a deliberately heavier look.

The theme also loads Old Standard TT in three weights and applies it to nothing.
Drop it.

Blockquotes are the one exception to Open Sans, using `"Times New Roman", Times, serif`.
Code uses the bare keyword `monospace` with no family specified.

## Things to decide before building

1. **Bold weight.** Match the original's effective 600, or upgrade to a real 700.
2. **Code blocks.** Audit the content export for `hcb_wrap`, then pick one treatment. The plain unstyled blocks are almost certainly not intentional.
3. **The 760-1100 dead zone.** Reproducing it gives 768px tablets a 178px sidebar. Stacking at 1100 alongside the nav collapse is the obvious fix.
4. **Mobile sidebar length.** Over 4,000px of widgets below every article on mobile. Consider collapsing, filtering or dropping most of it at small widths.
5. **Floating share buttons.** They overlap content at 390px. Rebuild as inline share links or drop them.
6. **Pagination inversion.** The current page is unfilled and the other pages are filled black. Confirm this is wanted.
7. **Nav active state.** The homepage highlights nothing because of the `current_page_parent` vs `current_page_item` mismatch. Fix or reproduce.
8. **Heading size inconsistency.** A post's own `h1` is 26px while an archive title is 32px and an in-body `h1` is 32px.
9. **Button radius.** Subscribe is a pill, Search is a 5px rectangle. Unify or keep.

## Screenshot inventory

All under `migration/design/shots/`, full-page, cropped to the exact viewport width.

| File | Page | Width |
| --- | --- | --- |
| `home-1440.png` / `home-768.png` / `home-390.png` | Homepage | 1440 / 768 / 390 |
| `post-1440.png` / `post-768.png` / `post-390.png` | SSW homepage facelift post | 1440 / 768 / 390 |
| `post-code-1440.png` / `post-code-768.png` / `post-code-390.png` | .NET Aspire 9.4 post, contains a `<pre>` | 1440 / 768 / 390 |
| `category-1440.png` / `category-768.png` / `category-390.png` | `/category/general/` | 1440 / 768 / 390 |
| `about-1440.png` / `about-768.png` / `about-390.png` | `/about-adam-cogan/` | 1440 / 768 / 390 |
| `nav-open-390.png` | Mobile hamburger menu, open state | 390, viewport only |
