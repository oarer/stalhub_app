// URL-хелперы для динамического контента.
// Сайт (server build) использует path-схему (/users/123) — важно для SEO.
// Десктоп (Tauri, static export) не может пререндерить бесконечные path-параметры,
// поэтому там действует query-схема (/users?id=123) поверх статичных страниц.
// Все ссылки на динамический контент должны строиться через эти хелперы.
import { IS_STATIC_EXPORT } from './isStaticExport'

export function userHref(id: number | string): string {
	if (!IS_STATIC_EXPORT) return `/users/${id}`
	return typeof id === 'number' || /^\d+$/.test(String(id))
		? `/users?id=${id}`
		: `/users?username=${encodeURIComponent(String(id))}`
}

export function articleHref(id: string | number): string {
	if (!IS_STATIC_EXPORT) return `/articles/${id}`
	return `/articles?id=${encodeURIComponent(String(id))}`
}

export function artHref(id: string | number): string {
	if (!IS_STATIC_EXPORT) return `/arts/${id}`
	return `/arts?id=${encodeURIComponent(String(id))}`
}

export function tierlistHref(id: string): string {
	if (!IS_STATIC_EXPORT) return `/tierlists/${id}`
	return `/tierlists?id=${encodeURIComponent(id)}`
}

export function tierlistEditHref(id: string): string {
	if (!IS_STATIC_EXPORT) return `/tierlists/${id}/edit`
	return `/tierlists?id=${encodeURIComponent(id)}&edit=1`
}

export function meTierlistEditHref(id: string): string {
	if (!IS_STATIC_EXPORT) return `/me/tierlists/${id}/edit`
	return `/me/tierlists?edit=${encodeURIComponent(id)}`
}

export function meArticleEditHref(id: string): string {
	if (!IS_STATIC_EXPORT) return `/me/articles/${id}/edit`
	return `/me/articles?edit=${encodeURIComponent(id)}`
}

export function meArtEditHref(id: string): string {
	if (!IS_STATIC_EXPORT) return `/me/arts/${id}/edit`
	return `/me/arts?edit=${encodeURIComponent(id)}`
}

export function playerHref(region: string, character: string): string {
	if (!IS_STATIC_EXPORT) return `/player/${region}/${encodeURIComponent(character)}`
	return `/player?region=${encodeURIComponent(region)}&character=${encodeURIComponent(character)}`
}

// slugPath — остаток пути вида "weapon/ak-.../..." или "/weapon/ak-..." (см.
// BarterUsedIn/BarterItem: `/items${item.category}`).
export function itemHref(slugPath: string): string {
	if (!IS_STATIC_EXPORT) {
		return slugPath.startsWith('/') ? `/items${slugPath}` : `/items/${slugPath}`
	}
	const slug = slugPath.startsWith('/') ? slugPath.slice(1) : slugPath
	return `/items?slug=${encodeURIComponent(slug)}`
}

export function adminClanHref(id: string | number): string {
	if (!IS_STATIC_EXPORT) return `/admin/clans/${id}`
	return `/admin/clans?id=${encodeURIComponent(String(id))}`
}

export function adminUserHref(id: string | number): string {
	if (!IS_STATIC_EXPORT) return `/admin/users/${id}`
	return `/admin/users?id=${encodeURIComponent(String(id))}`
}
