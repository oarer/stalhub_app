import { fetchLatestCommit, fetchListing, LISTING_TTL } from '@/lib/listing'
import { useItemStore } from '@/stores/items.store'

export type CatalogPhase = 'checking' | 'downloading' | 'done' | 'offline'

export type CatalogLoadResult =
	| { status: 'done' }
	| { status: 'offline'; error: string }

const OFFLINE_MESSAGE = 'Не удалось получить актуальные данные'

let inflight: Promise<CatalogLoadResult> | null = null

export function loadCatalog(options?: {
	onPhase?: (phase: CatalogPhase) => void
}): Promise<CatalogLoadResult> {
	if (!inflight) {
		inflight = runCatalogLoad(options).finally(() => {
			inflight = null
		})
	}
	return inflight
}

async function runCatalogLoad(options?: {
	onPhase?: (phase: CatalogPhase) => void
}): Promise<CatalogLoadResult> {
	const { onPhase } = options ?? {}
	const now = Date.now()
	const {
		items,
		commit,
		checkedAt,
		setItems,
		setCommit,
		setCheckedAt,
		setError,
		setLoading,
	} = useItemStore.getState()

	const isFresh = !!(checkedAt && now - checkedAt < LISTING_TTL)

	// Данные уже в сторе и проверены недавно — не дёргаем сеть.
	if (items && commit && isFresh) {
		onPhase?.('done')
		return { status: 'done' }
	}

	setLoading(true)
	setError(null)
	onPhase?.('checking')

	try {
		// GitHub is only a cache validator; rate limits must not hide the CDN catalog.
		const latestSHA = await fetchLatestCommit()
		const currentSHA = commit

		if (latestSHA && latestSHA === currentSHA && items) {
			setCheckedAt(now)
			onPhase?.('done')
			return { status: 'done' }
		}

		onPhase?.('downloading')
		const freshItems = await fetchListing(latestSHA)
		if (freshItems) {
			setItems(freshItems)
			setCommit(latestSHA ?? currentSHA ?? `cdn-${now}`)
			setCheckedAt(now)
			onPhase?.('done')
			return { status: 'done' }
		}

		// Несвежий кэш остаётся работоспособным, если сеть недоступна.
		if (items && checkedAt) {
			onPhase?.('offline')
			return { status: 'offline', error: OFFLINE_MESSAGE }
		}
		setError(OFFLINE_MESSAGE)
		onPhase?.('offline')
		return { status: 'offline', error: OFFLINE_MESSAGE }
	} catch {
		if (!checkedAt || now - checkedAt > LISTING_TTL)
			setError(OFFLINE_MESSAGE)
		onPhase?.('offline')
		return { status: 'offline', error: OFFLINE_MESSAGE }
	} finally {
		useItemStore.getState().setLoading(false)
	}
}
