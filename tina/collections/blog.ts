import type { Collection } from "tinacms";
import { youTubeEmbedTemplate } from "../../src/components/mdx/YouTubeEmbed.template";
import { figureTemplate } from "../../src/components/mdx/Figure.template";
import { videoTemplate } from "../../src/components/mdx/Video.template";
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
  },
  fields: [
    {
      type: "string",
      name: "title",
      label: "Title",
      isTitle: true,
      required: true,
    },
    {
      name: "description",
      label: "Description",
      type: "string",
      ui: { component: "textarea" },
    },
    {
      name: "pubDate",
      label: "Publication Date",
      type: "datetime",
      required: true,
      description: "Also determines the post URL, so changing it changes the permalink.",
    },
    {
      name: "updatedDate",
      label: "Updated Date",
      type: "datetime",
    },
    {
      name: "heroImage",
      label: "Hero Image",
      type: "image",
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
    },
    {
      name: "tags",
      label: "Tags",
      type: "string",
      list: true,
      options: options(taxonomy.tags),
    },
    {
      name: "legacyUrl",
      label: "Original WordPress URL",
      type: "string",
      description: "Path this post had on WordPress. Kept so permalink drift is detectable.",
    },
    {
      name: "wpId",
      label: "WordPress post ID",
      type: "number",
      description: "Traceability back to the source export.",
    },
    {
      type: "rich-text",
      name: "body",
      label: "Body",
      isBody: true,
      templates: [youTubeEmbedTemplate, figureTemplate, videoTemplate],
    },
  ],
};
