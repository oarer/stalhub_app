'use client'

import { useEffect } from 'react'
import { loadCatalog } from '@/lib/catalogPreload'
import { useItemStore } from '@/stores/items.store'

export function useSearchItem() {
	useEffect(() => {
<<<<<<< Updated upstream
		let cancelled = false

		async function load() {
			const time = Number(localStorage.getItem(LS_TIME))
			const isFresh = !!(time && Date.now() - time < TTL)

			// Данные уже в сторе и проверены недавно — не дёргаем сеть.
			if (items && commit && isFresh) return

			setLoading(true)

			const cached = localStorage.getItem(LS_DATA)
			const cachedCommit = localStorage.getItem(LS_COMMIT)

			let cachedItems: ItemListing[] | null = null
			if (cached) {
				try {
					cachedItems = JSON.parse(cached)
				} catch {
					cachedItems = null
				}
			}

			if (!items && cachedItems) setItems(cachedItems)
			if (!commit && cachedCommit) setCommit(cachedCommit)

			try {
				const res = await fetch(COMMITS_API)
				if (!res.ok) throw new Error('GitHub API error')
				const data = await res.json()

				const latestSHA = data?.[0]?.sha
				if (!latestSHA) throw new Error('No commits')

				const currentSHA = cachedCommit ?? commit

				if (latestSHA === currentSHA && (items ?? cachedItems)) {
					if (!items && cachedItems) setItems(cachedItems)
					localStorage.setItem(LS_TIME, Date.now().toString())
					return
				}

				// Cache-bust: CDN кэширует /db/listing.json на 24ч (immutable),
				// но кэширует ключ по полному URL — новый SHA даёт новый ключ.
				const freshRaw = await fetch(`${LISTING_URL}?v=${latestSHA}`)
				if (!freshRaw.ok) throw new Error('Listing fetch error')
				const freshItems = (await freshRaw.json()) as ItemListing[]

				if (cancelled) return

				setItems(freshItems)
				setCommit(latestSHA)

				localStorage.setItem(LS_DATA, JSON.stringify(freshItems))
				localStorage.setItem(LS_COMMIT, latestSHA)
				localStorage.setItem(LS_TIME, Date.now().toString())

				console.log(
					`%cДанные были обновлены! Коммит: ${latestSHA}`,
					'color: green; font-weight: bold'
				)
			} catch (e) {
				console.log(e, 'error fetching items')
				if (!time || Date.now() - time > TTL)
					setError('Не удалось получить актуальные данные')
			} finally {
				if (!cancelled) setLoading(false)
			}
		}

		load()

		return () => {
			cancelled = true
		}
	}, [setItems, setCommit, setError, setLoading, items, commit])
=======
		// Shared singleton: if the splash is already loading the catalog,
		// this reuses that in-flight request instead of duplicating it.
		void loadCatalog()
	}, [])
>>>>>>> Stashed changes

	return useItemStore()
}
