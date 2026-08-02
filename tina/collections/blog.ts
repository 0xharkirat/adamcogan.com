import type { Collection } from "tinacms";
import { youTubeEmbedTemplate } from "../../src/components/mdx/YouTubeEmbed.template";
import { figureTemplate } from "../../src/components/mdx/Figure.template";
import { videoTemplate } from "../../src/components/mdx/Video.template";
import { galleryTemplate } from "../../src/components/mdx/Gallery.template";
import taxonomy from "../../src/data/taxonomy.json";

/**
 * The most-used migrated terms are surfaced as guidance under the category and
 * tag fields, so an editor is nudged towards reusing an existing name rather
 * than inventing a near-duplicate, without being prevented from adding one.
 */
const mostUsed = (group: Record<string, { name: string; count?: number }>, n: number) =>
  Object.values(group)
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.name.localeCompare(b.name))
    .slice(0, n)
    .map((t) => t.name)
    .join(", ");

const EXISTING_CATEGORIES = mostUsed(taxonomy.categories, 12);
const EXISTING_TAGS = mostUsed(taxonomy.tags, 12);

export const BlogCollection: Collection = {
  name: "blog",
  label: "Blogs",
  path: "src/content/blog",
  format: "mdx",
  ui: {
    router({ document }) {
      // Posts keep their WordPress permalink, so the router rebuilds the dated
      // path rather than using the filename alone.
      const date = new Date((document as { pubDate?: string }).pubDate ?? "");
      if (Number.isNaN(date.getTime())) return `/blog/${document._sys.filename}`;
      const yyyy = date.getUTCFullYear();
      const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(date.getUTCDate()).padStart(2, "0");
      return `/${yyyy}/${mm}/${dd}/${document._sys.filename}/`;
    },

    /**
     * Writing a post should not start with "what should the file be called".
     * The filename becomes the last part of the URL, so it is derived from the
     * title automatically and stays editable for anyone who wants a shorter
     * slug.
     */
    filename: {
      readonly: false,
      slugify: (values) =>
        String(values?.title ?? "")
          .toLowerCase()
          .replace(/['’]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 80) || "untitled",
    },

    /**
     * A new post opens ready to write in: dated today and attributed, rather
     * than showing empty required fields that block saving.
     */
    defaultItem: () => ({
      pubDate: new Date().toISOString(),
      author: "Adam Cogan",
      categories: ["general"],
    }),
  },
  fields: [
    {
      type: "string",
      name: "title",
      label: "Title",
      isTitle: true,
      required: true,
      description: "Shown as the post heading and used to build the page address.",
    },
    {
      name: "description",
      label: "Summary",
      type: "string",
      ui: { component: "textarea" },
      description:
        "The teaser shown on the blog list and in Google results. Two or three sentences.",
    },
    {
      name: "pubDate",
      label: "Publication Date",
      type: "datetime",
      required: true,
      description:
        "Sets the page address (/YYYY/MM/DD/...). Changing it on a published post changes its address and breaks existing links.",
    },
    {
      name: "updatedDate",
      label: "Updated Date",
      type: "datetime",
      description: "Optional. Shown at the foot of the post as \"Last updated\".",
    },
    {
      name: "heroImage",
      label: "Banner image",
      type: "image",
      description: "Wide banner at the top of the post and on the blog list. Around 670x241.",
    },
    {
      name: "author",
      label: "Author",
      type: "string",
      options: Object.values(taxonomy.authors).map((a) => a.name),
    },
    /*
     * Free-text, not a fixed list.
     *
     * These started as `options` dropdowns built from the migrated taxonomy,
     * which meant an editor could pick one of the existing 63 categories or 288
     * tags but could never add a new one. WordPress always allowed that, so the
     * dropdown was a regression dressed up as tidiness.
     *
     * Values are slugified when URLs are built, so typing "AI Agents" files the
     * post under /tag/ai-agents/ alongside the migrated "ai-agents" posts.
     * Existing slugs are unaffected, because slugifying a slug changes nothing.
     */
    {
      name: "categories",
      label: "Categories",
      type: "string",
      list: true,
      ui: { component: "tags" },
      description:
        "Broad topic, one or two. Type to add. Reuse an existing name where you can: " +
        EXISTING_CATEGORIES,
    },
    {
      name: "tags",
      label: "Tags",
      type: "string",
      list: true,
      ui: { component: "tags" },
      description:
        "Specific subjects, as many as apply. Type to add. Existing tags include: " +
        EXISTING_TAGS,
    },
    {
      name: "legacyUrl",
      label: "Legacy: original WordPress URL",
      type: "string",
      // Hidden rather than deleted: the verification script fails if a migrated
      // post stops serving at this address, but it is noise on the form and
      // meaningless on a new post.
      ui: { component: "hidden" },
    },
    {
      name: "wpId",
      label: "Legacy: WordPress post ID",
      type: "number",
      ui: { component: "hidden" },
    },
    {
      type: "rich-text",
      name: "body",
      label: "Post",
      isBody: true,
      description:
        "Use the + button for images, videos and YouTube embeds. Captions follow the house style: \"Figure: what the image shows\".",
      templates: [youTubeEmbedTemplate, figureTemplate, videoTemplate, galleryTemplate],
    },
  ],
};
