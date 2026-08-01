import type { APIContext } from 'astro';
import rss from '@astrojs/rss';
import config from '../content/config/config.json';
import { getPosts } from '../lib/posts';

/**
 * Served at /feed.xml, with /feed/ and /rss.xml redirecting here so the URLs
 * WordPress published keep working for existing subscribers.
 */
export const prerender = true;

export async function GET(context: APIContext) {
	const posts = await getPosts();
	return rss({
		title: config.seo.title,
		description: config.seo.description,
		site: context.site ?? '',
		items: posts.map((post) => ({
			title: post.title,
			description: post.description || undefined,
			pubDate: post.pubDate,
			categories: post.categories,
			author: post.author ?? undefined,
			link: post.url,
		})),
	});
}
