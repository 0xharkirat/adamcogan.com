# Write and edit posts

This guide is for whoever writes on adamcogan.com.
It assumes no knowledge of how the site is built. You edit everything through a form in your browser.

## Before you start

Open **<https://adamcogan.vercel.app/admin>** and click **Log in**.

You sign in with TinaCloud, the service that looks after the site's content.
If you have never signed in, ask a developer to invite you first.

That is the whole setup.
There is nothing to install, and nobody has to start anything for you.

## Create a post

1. Choose **Blogs** in the sidebar.
2. Click **Add File**.
3. Fill in the **Title**.
   This is the heading readers see, and it also builds the post's web address.
4. Write a **Summary**.
   This is the teaser on the blog list and the description Google shows.
   Aim for 2 or 3 sentences.
5. Check the **Publication Date**.
   It is already set to today.
   Change it only if you are backdating the post.
6. Add a **Banner image** if you have one.
   Around 670 by 241 pixels looks right.
7. Choose **Categories** and **Tags**.
   See [Categories and tags](#categories-and-tags) below.
8. Write the post in the **Post** field.
9. Click **Save**.

## What happens when you save

Saving records your post and starts a rebuild of the site.
The post appears on the live site a few minutes later.

The delay is normal.
Every page is built ahead of time, which is what makes the site fast, and that
build has to finish before anything new is visible.

If a post has not appeared after about 10 minutes, tell a developer.

## How the web address is built

You never type a web address.
The site works it out from the title and the publication date.

A post titled **"Why we moved to Azure"** published on **19 January 2026** becomes:

```
/2026/01/19/why-we-moved-to-azure/
```

The date supplies `/2026/01/19/`, and the title becomes `why-we-moved-to-azure`.
This is the same address format the old WordPress site used, which is why every old link still works.

Another 3 pages appear on their own, and you do not create them:

| Address | What it lists |
| --- | --- |
| `/2026/` | Everything published in 2026 |
| `/2026/01/` | Everything published in January 2026 |
| `/2026/01/19/` | Everything published that day |

If 2 posts go out on the same day, both appear on the day page, and each keeps its own address.
There are no folders to create.
The site groups posts by date for you.

### Changing the address

The **Filename** field at the bottom of the form holds the last part of the address.
It fills in from your title automatically.
Edit it if you want something shorter, for example `azure-move` instead of `why-we-moved-to-azure`.

> [!WARNING]
> Changing the publication date or the filename on a post that is already published **changes its web address**.
> Anyone who bookmarked or linked to the old address gets a "Page not found".
> Only change these on a post nobody has seen yet.

## Categories and tags

Both group posts, and both get their own page.

**Categories** are broad, and there should be few of them.
General, SSW Projects, AI, Scrum.
Pick 1 or 2.

**Tags** are specific, and there can be many.
best practice, customer journey, TinaCMS.
Pick as many as apply.

Type to add either one.
The field suggests names already in use, and reusing an existing name is better than inventing a near-duplicate.
"AI Agents" and "ai agents" end up on the same page, but "AI Agents" and "AI Agent" do not.

A new category or tag creates its page automatically at `/category/your-name/` or `/tag/your-name/`.
Capital letters and spaces are fine.
"AI Agents" becomes `/category/ai-agents/`.

## Add images

Click the **+** button inside the Post field and choose an image.

Use **Figure (captioned image)** when the image needs a caption, which is most of the time.
House style is to start the caption with `Figure:`, as in `Figure: The new homepage on mobile`.

**YouTube Embed** takes the video ID, the 11 characters after `v=` in a YouTube address.
**Video (self-hosted)** is for video files uploaded to the site rather than YouTube.
Ignore **Gallery (legacy)**; it exists only for 2 old posts.

Images you upload go into the site's shared media library.
There is no separate library per post.

## Edit an existing post

Open the post from **Blogs**, or click straight onto the text on the preview beside the form.
Clicking the page opens the form at that exact field, which is usually faster than scrolling.

Changes appear in the preview as you type.
Nothing is saved until you click **Save**.
**Reset** discards everything since your last save.

Editing the words, summary, image, categories or tags of a published post is always safe.
Only the date and filename change its address.

## Fields you can ignore

Posts migrated from WordPress carry 2 hidden fields recording where they used to live.
They stay hidden on the form, so you can leave them alone.

## If something looks wrong

Reload the page first.
A stale editor is the most common cause, and a reload fixes it.

If the editor refuses to save, or a post has not appeared on the site after
about 10 minutes, tell a developer.
Those are signs something needs attention behind the scenes rather than
anything you did.

## Editing on a developer's machine

Developers sometimes run the site on their own computer to try changes before
they go live. That editor is at `localhost:4321/admin/index.html` and needs
`pnpm dev` running. See [Run the site locally](running-locally.md).

Anything saved there stays on that machine until it is pushed. For normal
writing, use the hosted editor at the top of this guide.
