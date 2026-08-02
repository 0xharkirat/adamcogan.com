import type { Collection } from "tinacms";
import { youTubeEmbedTemplate } from "../../src/components/mdx/YouTubeEmbed.template";
import { figureTemplate } from "../../src/components/mdx/Figure.template";
import { videoTemplate } from "../../src/components/mdx/Video.template";
import { galleryTemplate } from "../../src/components/mdx/Gallery.template";
import taxonomy from "../../src/data/taxonomy.json";

/**
 * Category and tag options come from the migrated WordPress taxonomy so the
 * editor picks from the real list instead of retyping slugs. Values are WP
 * slugs, which keeps /category/<slug>/ and /tag/<slug>/ identical to the old
 * site; labels are the human-readable names.
 */
const options = (group: Record<string, { name: string; count?: number }>) =>
  Object.entries(group)
    .sort(([, a], [, b]) => (b.count ?? 0) - (a.count ?? 0) || a.name.localeCompare(b.name))
    .map(([value, { name }]) => ({ value, label: name }));

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
    {
      name: "categories",
      label: "Categories",
      type: "string",
      list: true,
      options: options(taxonomy.categories),
      description: "Broad topic. Pick one or two.",
    },
    {
      name: "tags",
      label: "Tags",
      type: "string",
      list: true,
      options: options(taxonomy.tags),
      description: "Specific subjects. Pick as many as apply.",
    },
    {
      name: "legacyUrl",
      label: "Legacy: original WordPress URL",
      type: "string",
      description:
        "Migration bookkeeping. Leave blank on new posts. On migrated posts this records the address the post had on WordPress, and the verification script fails if a post stops serving at it.",
    },
    {
      name: "wpId",
      label: "Legacy: WordPress post ID",
      type: "number",
      description: "Migration bookkeeping. Leave blank on new posts.",
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
