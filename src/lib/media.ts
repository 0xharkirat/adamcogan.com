import sizes from '../data/media-sizes.json';

/**
 * Intrinsic pixel dimensions for images under /media.
 *
 * Content references images by path only, so nothing in the MDX carries a
 * width or height. Without them the browser cannot reserve space and the page
 * reflows as each image decodes, which is the layout shift you see scrolling a
 * long post. The map is generated from the files themselves during the
 * migration, so it cannot drift from what is on disk.
 */
const table = sizes as Record<string, [number, number]>;

export type Dimensions = { width: number; height: number } | null;

export function mediaSize(src: string | undefined | null): Dimensions {
	if (!src) return null;
	// Content stores percent-encoded paths for the handful of filenames with
	// spaces; the map is keyed on the raw path.
	const key = table[src] ? src : decodeURI(src);
	const found = table[key];
	return found ? { width: found[0], height: found[1] } : null;
}
