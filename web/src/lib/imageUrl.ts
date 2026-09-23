import { IS_STATIC_EXPORT } from './isStaticExport'

// Upstream API для прямых ссылок в десктопе (там нет /api/* и /uploads/*
// роутов — static export). Совпадает с фолбэком прокси-роутов.
const DESKTOP_API_ORIGIN =
	process.env.NEXT_PUBLIC_API_ORIGIN || 'https://api.stalhub.dev'

// localhost в десктопе мёртв (там слушает только сам webview),
// поэтому локальные значения из .env.local игнорируем.
const envCdn = process.env.NEXT_PUBLIC_CDN_URL || ''
const DESKTOP_CDN_URL =
	envCdn && !envCdn.includes('localhost') && !envCdn.includes('127.0.0.1')
		? envCdn
		: 'https://cdn.stalhub.dev'

export function apiOrigin(): string {
	return IS_STATIC_EXPORT ? DESKTOP_API_ORIGIN : ''
}

export function avatarImageUrl(id: number | string): string {
	const path = `/api/v1/users/avatar/${id}`
	return IS_STATIC_EXPORT ? `${DESKTOP_API_ORIGIN}${path}` : path
}

export function resolveImageUrl(src: string | null | undefined): string | null {
	if (!src) return null
	// for local dev
	if (src.startsWith('/uploads/')) {
		return IS_STATIC_EXPORT ? `${DESKTOP_API_ORIGIN}${src}` : src
	}
	if (src.startsWith('/') && !src.startsWith('//')) {
		if (IS_STATIC_EXPORT) return `${DESKTOP_CDN_URL}${src}`
		return `${process.env.NEXT_PUBLIC_CDN_URL}${src}`
	}
	return src
}

export function isVideoUrl(src: string | null | undefined): boolean {
	if (!src) return false
	return /\.(mp4|webm)(\?.*)?$/i.test(src)
}
