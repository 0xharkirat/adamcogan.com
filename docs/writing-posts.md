# Write and edit posts

This guide is for whoever writes on adamcogan.com.
You do not need to know how the site is built, and you never edit a file directly.

## Before you start

Ask a developer to start the editor for you.
They run one command, and it stays running while you work:

```bash
pnpm dev
```

They will give you an address to open, usually **http://localhost:4321/admin/index.html**.
Open it and click **Enter Edit Mode**.

You should see "You are in local mode" in the top left.
If you see a TinaCloud sign-in screen instead, reload the page fully.
If it still asks you to sign in, tell the developer: the editor needs restarting.

## Create a post

1. Open the editor and choose **Blogs** in the sidebar.
2. Click **Add File**.
3. Fill in the **Title**.
   This is the heading readers see, and it also builds the post's web address.
4. Write a **Summary**.
   This is the teaser on the blog list and the description Google shows.
   Two or three sentences is right.
5. Check the **Publication Date**.
   It is already set to today.
   Change it only if you are backdating the post.
6. Add a **Banner image** if you have one.
   Around 670 by 241 pixels looks right.
7. Choose **Categories** and **Tags**.
   See [Categories and tags](#categories-and-tags) below.
8. Write the post in the **Post** field.
9. Click **Save**.

Saving writes the post to the copy of the site on that computer, and the preview updates straight away.
It is not on adamcogan.com yet.
A developer publishes it, which takes one step on their side.
Tell them when a post is ready.

## How the web address is built

You never type a web address.
The site works it out from the title and the publication date.

A post titled **"Why we moved to Azure"** published on **19 January 2026** becomes:

```
/2026/01/19/why-we-moved-to-azure/
```

The date supplies `/2026/01/19/`, and the title becomes `why-we-moved-to-azure`.
This is the same address format the old WordPress site used, which is why every old link still works.

Three more pages appear on their own, and you do not create them:

| Address | What it lists |
| --- | --- |
| `/2026/` | Everything published in 2026 |
| `/2026/01/` | Everything published in January 2026 |
| `/2026/01/19/` | Everything published that day |

If two posts go out on the same day, both appear on the day page, and each keeps its own address.
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
Pick one or two.

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

**YouTube Embed** takes the video ID, the eleven characters after `v=` in a YouTube address.
**Video (self-hosted)** is for video files uploaded to the site rather than YouTube.
Ignore **Gallery (legacy)**; it exists only for two old posts.

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

Posts migrated from WordPress carry two hidden fields recording where they used to live.
You will not see them on the form, and you do not need them.

## If something looks wrong

Reload the page first.
A stale editor is the most common cause, and a reload fixes it.

If the preview shows "Page not found" for a post you just created, or the editor will not save, tell a developer.
Those are both signs the editor needs restarting rather than anything you did.
