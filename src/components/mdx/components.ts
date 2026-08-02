import CodeBlock from './CodeBlock.astro';
import ContentImage from './ContentImage.astro';
import Figure from './Figure.astro';
import Gallery from './Gallery.astro';
import Video from './Video.astro';
import YouTubeEmbed from './YouTubeEmbed.astro';

/**
 * `img` overrides Tina's default image node so plain Markdown images get their
 * intrinsic dimensions too, not just the captioned ones.
 */
export const mdxComponents = {
	YouTubeEmbed,
	Figure,
	Gallery,
	Video,
	code_block: CodeBlock,
	img: ContentImage,
};
