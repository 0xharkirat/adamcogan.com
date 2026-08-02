import type { Collection } from 'tinacms';
import { youTubeEmbedTemplate } from '../../src/components/mdx/YouTubeEmbed.template';
import { figureTemplate } from '../../src/components/mdx/Figure.template';
import { videoTemplate } from '../../src/components/mdx/Video.template';
import { galleryTemplate } from '../../src/components/mdx/Gallery.template';

/**
 * Pages are prose documents. Both pages migrated from WordPress (About,
 * Tesla) are plain prose, so they use `body`.
 *
 * The starter shipped a space-themed block builder here. No content used it,
 * and its Hero/Stats/Cta components were styled for the starter's own design
 * rather than this one, so it was removed instead of left as dead weight that
 * would look wrong the first time anyone reached for it.
 */
export const PageCollection: Collection = {
	name: 'page',
	label: 'Pages',
	path: 'src/content/page',
	format: 'mdx',
	ui: {
		/*
		 * Adam's posts live in one flat folder, so folder creation is only a way to
		 * put a post somewhere the routes will not find it. `create` and `delete`
		 * stay on; only the folder buttons go.
		 */
		allowedActions: { create: true, delete: true, createFolder: false, createNestedFolder: false },
		router: ({ document }) => `/${document._sys.filename}/`,
	},
	fields: [
		{
			name: 'title',
			label: 'Title',
			type: 'string',
			isTitle: true,
			required: true,
			description: 'The heading shown at the top of the page.',
		},
		{
			name: 'seoTitle',
			label: 'Meta Title (SEO)',
			type: 'string',
			description:
				'Shown in the browser tab and search results, not on the page itself. Falls back to the Title above.',
		},
		{
			name: 'description',
			label: 'Meta Description (SEO)',
			type: 'string',
			ui: { component: 'textarea' },
		},
		{ name: 'pubDate', label: 'Publication Date', type: 'datetime' },
		{ name: 'updatedDate', label: 'Updated Date', type: 'datetime' },
		{ name: 'author', label: 'Author', type: 'string' },
		{
			name: 'legacyUrl',
			label: 'Original WordPress URL',
			type: 'string',
			description: 'Path this page had on WordPress. Kept so permalink drift is detectable.',
		},
		{ name: 'wpId', label: 'WordPress page ID', type: 'number' },
		{
			type: 'rich-text',
			name: 'body',
			label: 'Body',
			isBody: true,
			templates: [youTubeEmbedTemplate, figureTemplate, videoTemplate, galleryTemplate],
		},
	],
};
