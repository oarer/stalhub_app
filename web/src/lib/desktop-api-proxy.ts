const HOP = ['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-authorization', 'proxy-authenticate', 'te', 'trailer', 'content-length']

export function localCookie(cookie: string) {
	return cookie.replace(/;\s*(Domain=[^;]*|Secure|SameSite=[^;]*)/gi, '') + '; SameSite=Lax'
}

/** Fixed upstream, no redirects, same-origin callers only. Never proxy arbitrary URLs. */
export async function proxyApi(request: Request, path: string[], origin: string, transport: typeof fetch = fetch): Promise<Response> {
	const local = new URL(request.url)
	const host = request.headers.get('host') || local.host
	if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) return new Response('Forbidden host', { status: 403 })
	const callerOrigin = `http://${host}`
	if ((request.headers.get('origin') && request.headers.get('origin') !== callerOrigin) || request.headers.get('sec-fetch-site') === 'cross-site') return new Response('Forbidden origin', { status: 403 })
	if (!path.length || path.some(p => !p || p === '.' || p === '..' || /[\\/%?#]/.test(p))) return new Response('Invalid path', { status: 400 })
	let target: URL
	try {
		target = new URL(origin)
		if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.pathname !== '/') throw new Error()
	} catch { return new Response('API proxy is not configured', { status: 503 }) }
	target.pathname = `/api/v1/${path.map(segment => encodeURIComponent(segment).replace(/%40/g, '@')).join('/')}`
	target.search = local.search
	const headers = new Headers()
	// Explicit allowlist prevents forged proxy identities and leaked local headers.
	for (const name of ['accept', 'content-type', 'cookie', 'user-agent', 'authorization', 'range', 'if-none-match', 'if-modified-since']) {
		const value = request.headers.get(name)
		if (value) headers.set(name, value)
	}
	try {
		const init: RequestInit & { duplex: string } = {
			method: request.method, headers, redirect: 'manual', cache: 'no-store', signal: request.signal,
			body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, duplex: 'half',
		}
		const response = await transport(target, init)
		if (response.status >= 300 && response.status < 400 && response.status !== 304) return new Response('Unexpected upstream redirect', { status: 502 })
		const out = new Headers(response.headers)
		for (const name of [...HOP, 'set-cookie', 'content-encoding', 'access-control-allow-origin', 'access-control-allow-credentials']) out.delete(name)
		out.set('cache-control', 'no-store')
		for (const cookie of response.headers.getSetCookie()) out.append('set-cookie', localCookie(cookie))
		return new Response(response.body, { status: response.status, headers: out })
	} catch { return new Response('API upstream unavailable', { status: 502 }) }
}
