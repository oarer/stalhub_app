'use client'

import { useEffect } from 'react'

import { GITHUB_RAW_BASE } from '@/constants/github.const'
import { useItemStore } from '@/stores/items.store'
import type { ItemListing } from '@/types/api.type'

const LISTING_URL = `${GITHUB_RAW_BASE}listing.json`
const COMMITS_API =
	'https://api.github.com/repos/oarer/sc-db/commits?path=merged/listing.json&page=1&per_page=1'

const LS_DATA = 'items_cache'
const LS_COMMIT = 'items_commit'
const LS_TIME = 'items_time'
const TTL = 1000 * 60 * 10

export function useSearchItem() {
	const { items, commit, setItems, setCommit, setError, setLoading } =
		useItemStore()

	useEffect(() => {
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
				// GitHub is only a cache validator; rate limits must not hide the CDN catalog.
				let latestSHA: string | null = null
				try {
					const res = await fetch(COMMITS_API)
					if (res.ok) {
						const data: unknown = await res.json()
						latestSHA = Array.isArray(data) &&
							typeof data[0] === 'object' && data[0] !== null &&
							'sha' in data[0] && typeof data[0].sha === 'string'
							? data[0].sha : null
					}
				} catch {
					// Continue with a cache-busted catalog request below.
				}

				const currentSHA = cachedCommit ?? commit

				if (latestSHA && latestSHA === currentSHA && (items ?? cachedItems)) {
					if (!items && cachedItems) setItems(cachedItems)
					localStorage.setItem(LS_TIME, Date.now().toString())
					return
				}

				// Cache-bust: CDN кэширует /db/listing.json на 24ч (immutable),
				// но кэширует ключ по полному URL — новый SHA даёт новый ключ.
				const freshRaw = await fetch(`${LISTING_URL}?v=${latestSHA ?? Date.now()}`)
				if (!freshRaw.ok) throw new Error('Listing fetch error')
				const value: unknown = await freshRaw.json()
				if (!Array.isArray(value)) throw new Error('Invalid listing format')
				const freshItems = value as ItemListing[]

				if (cancelled) return

				setItems(freshItems)
				const storedCommit = latestSHA ?? currentSHA ?? `cdn-${Date.now()}`
				setCommit(storedCommit)

				localStorage.setItem(LS_DATA, JSON.stringify(freshItems))
				localStorage.setItem(LS_COMMIT, storedCommit)
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

	return useItemStore()
}
