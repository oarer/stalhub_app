import { GITHUB_RAW_BASE } from '@/constants/github.const'
import type { ItemListing } from '@/types/api.type'

export const LISTING_URL = `${GITHUB_RAW_BASE}listing.json`
export const COMMITS_API =
	'https://api.github.com/repos/oarer/sc-db/commits?path=merged/listing.json&page=1&per_page=1'

export const LISTING_TTL = 10 * 60 * 1000

export async function fetchLatestCommit(): Promise<string | null> {
	try {
		const response = await fetch(COMMITS_API)
		if (!response.ok) return null
		const data: unknown = await response.json()
		if (
			Array.isArray(data) &&
			typeof data[0] === 'object' &&
			data[0] !== null &&
			'sha' in data[0] &&
			typeof data[0].sha === 'string'
		) {
			return data[0].sha
		}
	} catch {
		// GitHub API may be rate-limited; the listing still loads below.
	}
	return null
}

export async function fetchListing(
	commit?: string | null
): Promise<ItemListing[] | null> {
	try {
		// Cache-bust: CDN кэширует /db/listing.json на 24ч (immutable),
		// но кэширует ключ по полному URL — новый SHA даёт новый ключ.
		const response = await fetch(`${LISTING_URL}?v=${commit ?? Date.now()}`)
		if (!response.ok) return null
		const value: unknown = await response.json()
		if (!Array.isArray(value)) return null
		return value as ItemListing[]
	} catch {
		return null
	}
}