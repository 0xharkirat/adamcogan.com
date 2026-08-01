/**
 * Per-collection data loaders + the data shapes they return.
 *
 * Loaders call the generated Tina client and pipe the result through
 * `requestWithMetadata()` so the editor overlay flows in when the page
 * renders inside the admin iframe and `tinaField()` has its metadata.
 *
 * Types below are pure derivations — no hand-written shapes. Each one is
 * either inferred from a loader's return type (`CmsConfig`/`CmsPage`/
 * `CmsBlog`) or `Extract`/index-accessed off those. The Tina collection
 * is the source of truth; regen with `tinacms dev` and everything
 * downstream updates.
 */
import type { TinaRichTextContent } from '@tinacms/astro';
import { requestWithMetadata } from '@tinacms/astro/data';
import client from '../../tina/__generated__/client';

export const getConfig = () =>
	requestWithMetadata(client.queries.config({ relativePath: 'config.json' }));

export const getPage = (slug: string) =>
	requestWithMetadata(client.queries.page({ relativePath: `${slug}.mdx` }), { priority: 'primary' });

export const getBlog = (slug: string) =>
	requestWithMetadata(client.queries.blog({ relativePath: `${slug}.mdx` }), { priority: 'primary' });

/**
 * Tina connections are cursor-paginated and cap a single response well below
 * this site's 183 posts, so every listing has to walk `hasNextPage` to the end.
 * Reading only the first page silently truncates the site: the build looks
 * clean and two thirds of the posts simply do not exist.
 */
async function listAll<T>(
	fetchPage: (after?: string) => Promise<{
		pageInfo: { hasNextPage: boolean; endCursor: string };
		edges?: ({ node?: T | null } | null)[] | null;
	}>,
): Promise<T[]> {
	const nodes: T[] = [];
	let after: string | undefined;

	for (;;) {
		const connection = await fetchPage(after);
		nodes.push(...(connection.edges ?? []).flatMap((edge) => (edge?.node ? [edge.node] : [])));
		if (!connection.pageInfo.hasNextPage) return nodes;
		after = connection.pageInfo.endCursor;
	}
}

export async function listPages() {
	return listAll(async (after) => (await client.queries.pageConnection({ first: 100, after })).data.pageConnection);
}

export async function listBlogs() {
	const nodes = await listAll(
		async (after) => (await client.queries.blogConnection({ first: 100, after })).data.blogConnection,
	);
	return nodes.sort((a, b) => {
		const ad = a.pubDate ? new Date(a.pubDate).valueOf() : 0;
		const bd = b.pubDate ? new Date(b.pubDate).valueOf() : 0;
		return bd - ad;
	});
}

export type CmsConfig = Awaited<ReturnType<typeof getConfig>>['data']['config'];
export type CmsPage = Awaited<ReturnType<typeof getPage>>['data']['page'];
export type CmsBlog = Awaited<ReturnType<typeof getBlog>>['data']['blog'];

export type CmsConfigNav = NonNullable<NonNullable<CmsConfig['nav']>[number]>;
export type CmsConfigContactLink = NonNullable<NonNullable<CmsConfig['contactLinks']>[number]>;
export type CmsConfigSeo = NonNullable<CmsConfig['seo']>;


/** Tina rich-text bodies are typed as `any` in the generated client; this is what `<TinaMarkdown>` expects. */
export type RichText = TinaRichTextContent;
