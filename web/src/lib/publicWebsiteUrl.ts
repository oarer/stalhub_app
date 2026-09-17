/** Share links must remain usable outside the desktop loopback server. */
export function publicWebsiteUrl(path: string): string {
	if (!path.startsWith('/') || path.startsWith('//') || /[\\\s]/.test(path)) {
		throw new Error('Expected an absolute website path')
	}
	return `https://stalhub.dev${path}`
}
