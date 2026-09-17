import { type NextRequest, NextResponse } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { LOCALE } from '@/types/item.type'

const intlMiddleware = createMiddleware({
	locales: LOCALE,
	defaultLocale: 'ru',
})

export function proxy(req: NextRequest) {
	const { pathname } = req.nextUrl
	// The bundled server is private to this machine, including SSR and assets.
	// Reject DNS rebinding and cross-origin browser requests before routing.
	const host = req.headers.get('host') || ''
	if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
		return new NextResponse('Forbidden host', { status: 403 })
	}
	const origin = req.headers.get('origin')
	if ((origin && origin !== `http://${host}`) || req.headers.get('sec-fetch-site') === 'cross-site') {
		return new NextResponse('Forbidden origin', { status: 403 })
	}
	if (pathname.startsWith('/api/') || pathname.startsWith('/uploads/') || pathname.startsWith('/_next/')) {
		return NextResponse.next()
	}

	const requestHeaders = new Headers(req.headers)
	requestHeaders.set('X-Path', pathname)

	const intlResponse = intlMiddleware(req)

	if (intlResponse) {
		intlResponse.headers.forEach((value, key) => {
			requestHeaders.set(key, value)
		})
	}

	return NextResponse.next({
		request: {
			headers: requestHeaders,
		},
	})
}
