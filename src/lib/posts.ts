/**
 * Post URL construction and archive grouping.
 *
 * Every post keeps the permalink it had on WordPress: /YYYY/MM/DD/<slug>/.
 * That is the whole reason this module exists rather than each route deriving
 * paths itself - one wrong timezone conversion here would silently break 183
 * inbound links, so the date maths lives in exactly one place.
 */
import taxonomy from '../data/taxonomy.json';
import { commentCountFor } from './comments';
import { listBlogs } from './data';

export type PostSummary = {
	slug: string;
	title: string;
	description: string;
	url: string;
	pubDate: Date;
	updatedDate: Date | null;
	heroImage: string | null;
	author: string | null;
	categories: string[];
	tags: string[];
	/** Migrated WordPress comments, shown as "N Comments" in the meta line. */
	commentCount: number;
};

/** Posts per page, matching the WordPress setting the old site used. */
export const POSTS_PER_PAGE = 10;

/**
 * Post dates are wall-clock values pinned to UTC, not true instants. See the
 * long note in `migration/scripts/2-transform.mjs`: WordPress's `date_gmt` is
 * identical to local time for 158 of the 183 posts, so it cannot be trusted,
 * and the local `date` field is the only thing that matches every permalink.
 *
 * Everything therefore reads and formats in UTC. Doing anything timezone-aware
 * here would shift posts across day boundaries and break their URLs.
 */
export const SITE_TIMEZONE = 'UTC';

/** Year/month/day of a post, exactly as WordPress numbered it. */
export function dateParts(date: Date) {
	return {
		year: String(date.getUTCFullYear()),
		month: String(date.getUTCMonth() + 1).padStart(2, '0'),
		day: String(date.getUTCDate()).padStart(2, '0'),
	};
}

export function postUrl(slug: string, pubDate: Date): string {
	const { year, month, day } = dateParts(pubDate);
	return `/${year}/${month}/${day}/${slug}/`;
}

/**
 * Turn a taxonomy value into its URL segment.
 *
 * Migrated posts store WordPress slugs ("ssw-projects"), and slugifying one is
 * a no-op, so their archive URLs are unchanged. Anything typed fresh in the CMS
 * ("AI Agents") becomes "ai-agents", which means an editor can invent a new
 * category or tag without having to know what a slug is.
 */
export function slugifyTerm(value: string): string {
	return String(value)
		.toLowerCase()
		.replace(/['’]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/**
 * Display label for a taxonomy value. Known WordPress slugs resolve to the
 * name they had on the old site ("net" -> ".NET"); anything else is shown as
 * it was typed.
 */
function displayName(group: Record<string, { name: string }>, value: string): string {
	if (group[value]) return group[value].name;
	const match = Object.keys(group).find((slug) => slug === slugifyTerm(value));
	return match ? group[match].name : value;
}

export function categoryName(value: string): string {
	return displayName(taxonomy.categories as Record<string, { name: string }>, value);
}

export function tagName(value: string): string {
	return displayName(taxonomy.tags as Record<string, { name: string }>, value);
}

let cache: PostSummary[] | null = null;

/**
 * All published posts, newest first.
 *
 * Memoised for production builds only, where every route calls this and the
 * content cannot change mid-build. In dev the cache is skipped: it persists
 * across requests, so a post created in the CMS would 404 until the server was
 * restarted, which makes the editor look broken to whoever just wrote it.
 */
export async function getPosts(): Promise<PostSummary[]> {
	if (cache && import.meta.env.PROD) return cache;

	const nodes = await listBlogs();
	cache = nodes
		.filter((node) => node.pubDate)
		.map((node) => {
			const slug = node._sys.filename;
			const pubDate = new Date(node.pubDate as string);
			return {
				slug,
				title: node.title ?? slug,
				description: node.description ?? '',
				url: postUrl(slug, pubDate),
				pubDate,
				updatedDate: node.updatedDate ? new Date(node.updatedDate) : null,
				heroImage: node.heroImage ?? null,
				author: node.author ?? null,
				categories: (node.categories ?? []).filter((c): c is string => Boolean(c)),
				tags: (node.tags ?? []).filter((t): t is string => Boolean(t)),
				commentCount: commentCountFor(slug),
			};
		})
		.sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf());

	return cache;
}

export type Page = {
	posts: PostSummary[];
	current: number;
	total: number;
	/** Absolute path of the previous/next page, or null at the ends. */
	prevUrl: string | null;
	nextUrl: string | null;
	/** Every page number paired with its URL, for the numbered pagination. */
	pages: { number: number; url: string }[];
};

/**
 * Slice a post list into one page.
 *
 * `base` is the listing root ('/' or '/category/ai/'). WordPress paginated
 * every listing as `<base>page/<n>/` with page 1 living at the bare base, and
 * those URLs are preserved.
 */
export function paginate(posts: PostSummary[], current: number, base = '/'): Page {
	const total = Math.max(1, Math.ceil(posts.length / POSTS_PER_PAGE));
	const urlFor = (n: number) => (n === 1 ? base : `${base}page/${n}/`);

	return {
		posts: posts.slice((current - 1) * POSTS_PER_PAGE, current * POSTS_PER_PAGE),
		current,
		total,
		prevUrl: current > 1 ? urlFor(current - 1) : null,
		nextUrl: current < total ? urlFor(current + 1) : null,
		pages: Array.from({ length: total }, (_, i) => ({ number: i + 1, url: urlFor(i + 1) })),
	};
}

/** Page numbers 2..N for a listing, used by getStaticPaths on /page/[page]. */
export function extraPageNumbers(postCount: number): number[] {
	const total = Math.ceil(postCount / POSTS_PER_PAGE);
	return Array.from({ length: Math.max(0, total - 1) }, (_, i) => i + 2);
}

/**
 * Every date archive WordPress serves, at all three levels: /YYYY/, /YYYY/MM/
 * and /YYYY/MM/DD/. The month and day levels are real published URLs on the old
 * site, not just path prefixes, so they have to exist here too.
 */
export async function getDateArchives(depth: 'year' | 'month' | 'day') {
	const posts = await getPosts();
	const groups = new Map<string, { parts: string[]; posts: PostSummary[] }>();

	for (const post of posts) {
		const { year, month, day } = dateParts(post.pubDate);
		const parts = depth === 'year' ? [year] : depth === 'month' ? [year, month] : [year, month, day];
		const key = parts.join('/');
		if (!groups.has(key)) groups.set(key, { parts, posts: [] });
		groups.get(key)!.posts.push(post);
	}

	return [...groups.values()].sort((a, b) => b.parts.join('/').localeCompare(a.parts.join('/')));
}

/** The year a post belongs to, in the site's timezone. */
export const postYear = (post: PostSummary) => Number(dateParts(post.pubDate).year);

/** Year archives, newest first. Drives both /YYYY/ and the sidebar list. */
export async function getArchives(): Promise<{ year: number; count: number }[]> {
	const posts = await getPosts();
	const counts = new Map<number, number>();
	for (const post of posts) {
		const year = postYear(post);
		counts.set(year, (counts.get(year) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([year, count]) => ({ year, count }))
		.sort((a, b) => b.year - a.year);
}

/**
 * Posts grouped by taxonomy slug, for the category and tag archive routes.
 *
 * Grouping is on the slugified value, so a term typed as "AI Agents" in the CMS
 * lands in the same archive as the migrated "ai-agents" instead of creating a
 * near-duplicate page. A post is only counted once per group even if it carries
 * both spellings.
 */
export async function groupBy(field: 'categories' | 'tags'): Promise<Map<string, PostSummary[]>> {
	const posts = await getPosts();
	const groups = new Map<string, PostSummary[]>();
	for (const post of posts) {
		const seen = new Set<string>();
		for (const value of post[field]) {
			const slug = slugifyTerm(value);
			if (!slug || seen.has(slug)) continue;
			seen.add(slug);
			if (!groups.has(slug)) groups.set(slug, []);
			groups.get(slug)!.push(post);
		}
	}
	return groups;
}
