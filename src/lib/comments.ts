/**
 * The migrated WordPress comment archive.
 *
 * These are read-only history: 154 different people wrote them between 2011 and
 * 2026. No comment host can reproduce that authorship, so rather than importing
 * them into a service that would re-attribute every one to a single account,
 * they are kept as content with their original names and dates.
 *
 * New comments are handled separately by Giscus. See `Comments.astro`.
 *
 * The bodies were reduced to a small inline-only tag set at migration time
 * (`migration/scripts/lib/comments.mjs`), so they are safe to render as HTML.
 * Do not put un-sanitised text through this path.
 */
import archive from '../data/comments.json';

export type ArchivedComment = {
	id: number;
	author: string;
	authorUrl: string | null;
	date: string;
	html: string;
	replies: ArchivedComment[];
};

const bySlug = archive as unknown as Record<string, ArchivedComment[]>;

export function commentsFor(slug: string): ArchivedComment[] {
	return bySlug[slug] ?? [];
}

/** Total including nested replies, for the "N Comments" count in the meta line. */
export function countComments(list: ArchivedComment[]): number {
	return list.reduce((n, c) => n + 1 + countComments(c.replies ?? []), 0);
}

export function commentCountFor(slug: string): number {
	return countComments(commentsFor(slug));
}
