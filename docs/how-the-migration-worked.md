# How this migration worked

Adam Cogan's blog ran on WordPress for over twenty years.
This explains how it was moved to a new system without losing anything, written so you can follow it even if you have never built a website.

You do not need to read this to use the site.
It is here so the next person can see how it was done, and repeat it.

## The problem

The blog had 183 posts going back to 2002, plus 910 images and videos, and 175 reader comments.

Moving all that by hand would mean opening 183 pages, copying the text, saving every image, and pasting it into the new site.
That would take weeks, and a human copying 183 posts will make mistakes.
Worse, you would not know which ones.

So everything here is done by scripts.
A script does the same thing every time, and if it gets something wrong it gets it wrong consistently, which is much easier to find and fix.

## The surprising part: we never logged in to WordPress

You might expect step one to be "get the WordPress admin password".

We never had it. It turned out not to be necessary.

WordPress publishes everything on the site through something called a **REST API**, and it is on by default.
An API is a web address that returns data instead of a web page.
Open a normal blog post and you get something designed for a human to read.
Open the API version and you get the same post as structured data: title here, date there, categories in a list.

For this blog, the API lived at:

```
https://adamcogan.com/wp-json/wp/v2/posts
```

That is public.
Anyone can open it right now.
It returns every published post, with its title, date, web address, categories, tags, author and full text.

This matters for two reasons.

It is **faster and more accurate** than reading the pages.
A blog page mixes the post with the menu, the sidebar, the share buttons and the footer.
Pulling the post out of that means guessing which bits are the article, and guessing is where mistakes come from.
The API hands you the article and nothing else.

It also means the migration can be **prepared before anyone gives you access**.
All of the work below happened against the public site.

## The five steps

### 1. Copy the content out

A script asked the API for everything and saved it as files on the computer:
posts, pages, categories, tags, authors and comments.

It saves the raw untouched data first, before changing anything.
Every later step reads from those files instead of asking the website again.
So if a step needs redoing, and several did, it can be rerun instantly without hammering someone else's server 183 times.

### 2. Convert the writing

WordPress stores posts as HTML, the language web pages are written in.
The new site stores posts as Markdown, a much simpler format that is readable as plain text.

A script translated one to the other.
Most of it is mechanical: a heading becomes a heading, a link becomes a link.

The interesting work was the things that do not translate cleanly.

**Captions.** Adam captions nearly every image, always starting with "Figure:".
There were 713 of them.
Markdown has no concept of a caption, so a `Figure` component was added to hold the image and its caption together.

**Videos.** 134 YouTube embeds, plus five video files uploaded directly to the blog.

**Tables.** Fourteen tables, and the oldest ones had broken HTML left over from someone pasting out of Word in 2012.

**Galleries.** Two posts from 2011 used a photo grid.

One deliberate choice: an AI was *not* used to convert the posts.
It would be slower, it would produce slightly different output every run, and it might quietly reword Adam's writing.
A script does exactly the same thing every time and never invents a sentence.

### 3. Bring the images and videos

Another script read the converted posts, collected every image they mention, and downloaded those files.

Only the ones actually used.
The WordPress media library held 1,247 items, but most were thumbnails or old uploads nobody links to.

The originals were enormous: 641 MB in total, including phone photos still at full camera resolution.
One was 8256 pixels wide, for a column 665 pixels wide.

So they were resized and converted to WebP, a newer image format that looks the same at a fraction of the size.
Videos became WebM and MP4.
641 MB became 107 MB. Smaller files mean pages that finish loading sooner, especially on a phone.

### 4. Rebuild the look

The goal was for readers not to notice anything had changed.

A browser was pointed at the real site to measure it: exact colours, font sizes, spacing, column widths.
Not guessed by eye.
Measured, then rebuilt to those numbers.

Some of what turned up looks like a mistake and is not:

- The big "ADAM COGAN" title has a line height smaller than its own letters, which is what keeps the header compact.
- Links are the same colour as normal text, marked only by a faint grey underline.
- Code blocks have no styling at all.
- In the page numbers at the bottom, the page you are *on* is the plain one and the others are filled circles, which is backwards from most sites.

All copied deliberately.
"Fixing" them would have made the site stop looking like Adam's.

### 5. Prove it worked

Three checks run automatically, and they are what caught the real problems.

**Every old link still works.**
The script fetches WordPress's own list of every post address and confirms the new site serves all 183.
A blog running since 2002 is linked to from a lot of places, and none of those links can be updated by us.

**Every post says the same thing.**
It compares the words in each new post against the original, one by one, and reports anything missing.

**Nothing is broken.**
Every image referenced actually exists, and no WordPress leftovers ended up in the output.

## What the checking caught

The word-by-word comparison found two bugs that nothing else would have.

Both were invisible.
Nothing failed, and the pages looked fine.

**One post lost 88% of its text.**
The rule for handling YouTube videos was too greedy.
If a video sat inside a box that also contained the rest of the article, the rule replaced the *whole box* with only the video, deleting everything around it.
Two other posts lost 70% and 52% the same way.

**Two words got glued together.**
"SSW Hangzhou" and "New Office Tour" became "HangzhouNew", because removing the invisible tag between them left no space.

Neither would have been spotted by looking at a few pages.
The first one only shows if you know how long that post is supposed to be.

The final score: **164 posts identical word for word**, 16 differing only where the original had stray formatting inside words, and 3 where a hand-typed list became a real numbered list.
Zero posts actually lost anything.

## How addresses stayed the same

On WordPress, a post published on 19 January 2026 lived at:

```
/2026/01/19/adams-2025-year-in-review/
```

The new site could have used something tidier.
It does not, because every one of those addresses is written down somewhere in the world: in someone's bookmarks, in a link from another blog, in Google's index.
Change them and all of that quietly breaks.

So the new site builds the same address from the post's date and title.
Nobody types it.

The date pages exist too, all three levels of them, because WordPress published those as real pages:
`/2026/`, `/2026/01/` and `/2026/01/19/`.
That one was missed at first, and the automatic checks are what found the 362 missing pages.

## What it runs on now

| Then | Now |
| --- | --- |
| WordPress | Astro, which turns the posts into plain web pages ahead of time |
| WordPress admin | TinaCMS, which edits the site with a live preview |
| A database | Text files in the project, one per post |
| A server building each page on request | Pages built once, served as files |

The last row is the biggest change.
WordPress assembled each page fresh every time somebody visited.
The new site builds all 1,117 pages once and serves them as finished files, which is faster and far harder to break.

## The tools

- The **WordPress REST API**, for reading the content without any login
- **Node.js scripts**, for the conversion, all kept in `migration/scripts/`
- **Playwright**, a tool that drives a real browser, for measuring the original design
- **sharp** and **ffmpeg**, for the images and video
- **Claude Code**, for writing the scripts and doing the comparisons

## Doing it again

The scripts are numbered and can be rerun as often as needed.
None of them destroys anything, and running one twice gives the same result as running it once.

See the "Re-running the migration" section of the [README](../README.md).
