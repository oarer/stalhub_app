'use client'

import { useEffect, useState } from 'react'
import { GITHUB_RAW_BASE } from '@/constants/github.const'
import type { ItemListing } from '@/types/api.type'

const LISTING_URL = `${GITHUB_RAW_BASE}listing.json`
const COMMITS_API =
	'https://api.github.com/repos/oarer/sc-db/commits?path=merged/listing.json&page=1&per_page=1'
// Share the existing item-cache contract so trading never maintains a second
// copy of the sc-db listing used by the rest of the application.
const CACHE_KEY = 'items_cache'
const COMMIT_KEY = 'items_commit'
const TIME_KEY = 'items_time'
const DISMISSED_KEY = 'trading-sc-db-dismissed-v1'
const CHECK_TTL = 10 * 60 * 1000

type TradingCatalogState = {
	items: ItemListing[] | null
	pendingItems: ItemListing[] | null
	commit: string | null
	pendingCommit: string | null
	loading: boolean
	error: boolean
	installUpdate: () => void
	dismissUpdate: () => void
}

function readCached(): ItemListing[] | null {
	try {
		const value: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')
		return Array.isArray(value) ? (value as ItemListing[]) : null
	} catch {
		return null
	}
}

export function useTradingCatalog(): TradingCatalogState {
	const [items, setItems] = useState<ItemListing[] | null>(null)
	const [pendingItems, setPendingItems] = useState<ItemListing[] | null>(null)
	const [commit, setCommit] = useState<string | null>(null)
	const [pendingCommit, setPendingCommit] = useState<string | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(false)

	useEffect(() => {
		let cancelled = false
		const cached = readCached()
		const cachedCommit = localStorage.getItem(COMMIT_KEY)
		const checkedAt = Number(localStorage.getItem(TIME_KEY) ?? 0)
		// Функциональные обновления: не создаём новую ссылку, если данные
		// уже в состоянии, — иначе StrictMode/перезапуски эффекта зациклятся.
		if (cached) setItems((current) => current ?? cached)
		if (cachedCommit) setCommit((current) => current ?? cachedCommit)
		if (cached && Date.now() - checkedAt < CHECK_TTL) setLoading(false)

		async function check() {
			try {
				const response = await fetch(COMMITS_API)
				if (!response.ok) throw new Error('commit check failed')
				const commits: unknown = await response.json()
				const latest =
					Array.isArray(commits) &&
					typeof commits[0] === 'object' &&
					commits[0] !== null &&
					'sha' in commits[0] &&
					typeof commits[0].sha === 'string'
						? commits[0].sha
						: null
				if (!latest || latest === cachedCommit) return
				const dataResponse = await fetch(`${LISTING_URL}?v=${latest}`)
				if (!dataResponse.ok) throw new Error('catalog fetch failed')
				const fresh = (await dataResponse.json()) as ItemListing[]
				if (cancelled) return
				if (localStorage.getItem(DISMISSED_KEY) === latest) return
				if (cached) {
					setPendingItems(fresh)
					setPendingCommit(latest)
				} else {
					setItems(fresh)
					setCommit(latest)
					localStorage.setItem(CACHE_KEY, JSON.stringify(fresh))
					localStorage.setItem(COMMIT_KEY, latest)
					localStorage.removeItem(DISMISSED_KEY)
				}
				localStorage.setItem(TIME_KEY, Date.now().toString())
			} catch {
				if (!cancelled && !cached) setError(true)
			} finally {
				if (!cancelled) setLoading(false)
			}
		}
		void check()
		return () => {
			cancelled = true
		}
		// Проверка выполняется один раз при монтировании; localStorage не реактивен.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const installUpdate = () => {
		if (!pendingItems || !pendingCommit) return
		setItems(pendingItems)
		setCommit(pendingCommit)
		setPendingItems(null)
		setPendingCommit(null)
		localStorage.removeItem(DISMISSED_KEY)
		try {
			localStorage.setItem(CACHE_KEY, JSON.stringify(pendingItems))
			localStorage.setItem(COMMIT_KEY, pendingCommit)
			localStorage.setItem(TIME_KEY, Date.now().toString())
		} catch {
			setError(true)
		}
	}

	const dismissUpdate = () => {
		if (pendingCommit) localStorage.setItem(DISMISSED_KEY, pendingCommit)
		setPendingItems(null)
		setPendingCommit(null)
	}

	return {
		items,
		pendingItems,
		commit,
		pendingCommit,
		loading,
		error,
		installUpdate,
		dismissUpdate,
	}
}
