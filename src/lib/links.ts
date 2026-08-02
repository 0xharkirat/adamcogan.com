/**
 * Which links count as leaving the site.
 *
 * The migrated content holds 74 absolute links that point at adamcogan.com
 * itself, because WordPress wrote internal links as full URLs. Those are this
 * site, so treating them as external would open the site in a new tab on top
 * of itself.
 */
const OWN_HOSTS = new Set(['adamcogan.com', 'www.adamcogan.com', 'adamcogan.vercel.app']);

export function isExternalHref(href: string | undefined | null): boolean {
	if (!href) return false;

	// Relative paths, anchors and non-web schemes never leave the site.
	if (!/^https?:\/\//i.test(href)) return false;

	try {
		return !OWN_HOSTS.has(new URL(href).hostname.toLowerCase());
	} catch {
		// One migrated post has `href="http://2022 SonicWall Cyber Threat Report"`,
		// where the link title was pasted into the URL box. It is broken on the
		// WordPress original too. An unparseable URL stays in the same tab.
		return false;
	}
}
