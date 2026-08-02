import { defineConfig } from "tinacms";
import { BlogCollection } from "./collections/blog";
import { GlobalConfigCollection } from "./collections/global-config";
import { PageCollection } from "./collections/page";

// Your hosting provider likely exposes this as an environment variable
const branch =
  process.env.GITHUB_BRANCH ||
  process.env.VERCEL_GIT_COMMIT_REF ||
  process.env.WORKERS_CI_BRANCH || // Cloudflare Workers Builds
  process.env.CF_PAGES_BRANCH || // Cloudflare Pages
  process.env.HEAD || // Netlify
  "main";

/**
 * A separate TinaCloud token from `TINA_TOKEN`, issued under API Tokens in the
 * dashboard. The content token will not index search.
 */
const searchToken = process.env.TINA_SEARCH_TOKEN;

export default defineConfig({
  telemetry: 'disabled',
  branch,

  /*
   * Both spellings are accepted. Astro exposes `PUBLIC_`-prefixed variables to
   * the browser and the starter shipped that name, but the TinaCloud dashboard
   * hands you `TINA_CLIENT_ID`. Reading only one of them leaves the other
   * silently undefined, and the symptom is obscure: the CMS redirects to
   * `app.tina.io/signin?clientId=undefined` and asks you to log in, which looks
   * like an auth problem rather than a missing variable.
   */
  clientId: process.env.PUBLIC_TINA_CLIENT_ID || process.env.TINA_CLIENT_ID,
  token: process.env.TINA_TOKEN,

  build: {
    outputFolder: "admin",
    publicFolder: "public",
  },
  media: {
    tina: {
      // Scoped to the media library so the picker shows Adam's images and
      // nothing else. Rooted at "" it also listed the built CMS assets, the
      // sidebar badge sprites and the favicon, which is noise for anyone
      // choosing a banner image. Existing content already references /media.
      mediaRoot: "media",
      publicFolder: "public",
    },
  },
  // See docs on content modeling for more info on how to setup new content models: https://tina.io/docs/schema/
  schema: {
    collections: [
      BlogCollection,
      PageCollection,
      GlobalConfigCollection,
    ],
  },

  /*
   * Search inside the CMS, so an editor can find one of 183 posts without
   * scrolling. This is NOT the search on the public site: readers use
   * /search, which Pagefind builds from the static HTML and needs no service.
   * The two are unrelated and both are wanted.
   *
   * Declared unconditionally, and that is the important part. This block was
   * originally wrapped in `...(searchToken ? {...} : {})` so a build without
   * credentials would skip it. That made the SCHEMA depend on an environment
   * variable: `tina-lock.json` gained or lost `schema.config.search` depending
   * on whether the token happened to be set, so a lock committed from one
   * machine never matched a build on another, and TinaCloud rejected every
   * deploy with "the local Tina schema doesn't match the remote Tina schema".
   *
   * The token itself is stripped before the lock is written (only
   * `stopwordLanguages` survives), so keeping this static costs nothing and
   * leaks nothing.
   */
  search: {
    tina: {
      indexerToken: searchToken,
      stopwordLanguages: ["eng"],
    },
    // 183 posts index comfortably in one pass; the field cap keeps long post
    // bodies from bloating the index.
    indexBatchSize: 100,
    maxSearchIndexFieldLength: 100,
  },
});
