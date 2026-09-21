const HOP = [
	'host',
	'connection',
	'keep-alive',
	'transfer-encoding',
	'upgrade',
	'proxy-authorization',
	'proxy-authenticate',
	'te',
	'trailer',
	'content-length',
]

export async function proxyUpload(
	request: Request,
	path: string[],
	origin: string
): Promise<Response> {
	const local = new URL(request.url)
	const host = request.headers.get('host') || local.host
	const callerOrigin = `http://${host}`
	if (
		!/^(127\.0\.0\.1|localhost):\d+$/.test(host) ||
		(request.headers.get('origin') &&
			request.headers.get('origin') !== callerOrigin) ||
		request.headers.get('sec-fetch-site') === 'cross-site'
	)
		return new Response('Forbidden origin', { status: 403 })
	if (
		!path.length ||
		path.some((p) => !p || p === '.' || p === '..' || /[\\/%?#]/.test(p))
	)
		return new Response('Invalid path', { status: 400 })
	let target: URL
	try {
		target = new URL(origin)
		if (
			!['http:', 'https:'].includes(target.protocol) ||
			target.username ||
			target.password ||
			target.pathname !== '/'
		)
			throw new Error()
	} catch {
		return new Response('Upload proxy is not configured', { status: 503 })
	}
	target.pathname = `/uploads/${path.map((segment) => encodeURIComponent(segment)).join('/')}`
	const headers = new Headers()
	for (const name of [
		'accept',
		'range',
		'if-none-match',
		'if-modified-since',
	]) {
		const value = request.headers.get(name)
		if (value) headers.set(name, value)
	}
	try {
		const response = await fetch(target, {
			headers,
			redirect: 'manual',
			signal: request.signal,
		})
		if (response.status >= 300 && response.status < 400)
			return new Response('Unexpected upstream redirect', { status: 502 })
		const out = new Headers(response.headers)
		for (const name of [
			...HOP,
			'content-encoding',
			'set-cookie',
			'access-control-allow-origin',
			'access-control-allow-credentials',
		])
			out.delete(name)
		out.set(
			'cache-control',
			response.headers.get('cache-control') || 'public, max-age=300'
		)
		return new Response(response.body, {
			status: response.status,
			headers: out,
		})
	} catch {
		return new Response('Upload upstream unavailable', { status: 502 })
	}
}
