import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { isLocalPersistenceEnabled } from '@/lib/localPersistence'
import type { ItemListing } from '@/types/api.type'

const LEGACY_DATA_KEY = 'items_cache'
const LEGACY_COMMIT_KEY = 'items_commit'
const LEGACY_TIME_KEY = 'items_time'

interface ItemState {
	items: ItemListing[] | null
	commit: string | null
	checkedAt: number
	loading: boolean
	error: string | null

	setItems: (items: ItemListing[]) => void
	setCommit: (commit: string) => void
	setCheckedAt: (time: number) => void
	setLoading: (state: boolean) => void
	setError: (err: string | null) => void
}

type PersistedItemState = Pick<
	ItemState,
	'items' | 'commit' | 'checkedAt'
>

function readLegacy(): PersistedItemState {
	try {
		const raw = localStorage.getItem(LEGACY_DATA_KEY)
		if (!raw) return { items: null, commit: null, checkedAt: 0 }
		const items = JSON.parse(raw) as unknown
		if (!Array.isArray(items)) return { items: null, commit: null, checkedAt: 0 }
		return {
			items: items as ItemListing[],
			commit: localStorage.getItem(LEGACY_COMMIT_KEY),
			checkedAt: Number(localStorage.getItem(LEGACY_TIME_KEY) ?? 0),
		}
	} catch {
		return { items: null, commit: null, checkedAt: 0 }
	}
}

export const useItemStore = create<ItemState>()(
	persist(
		(set) => ({
			items: null,
			commit: null,
			checkedAt: 0,
			loading: false,
			error: null,

			setItems: (items) => set({ items }),
			setCommit: (commit) => set({ commit }),
			setCheckedAt: (time) => set({ checkedAt: time }),
			setLoading: (state) => set({ loading: state }),
			setError: (error) => set({ error }),
		}),
		{
			name: 'stalhub:items',
			version: 1,
			storage: createJSONStorage(() => ({
				getItem: (name) =>
					isLocalPersistenceEnabled() ? localStorage.getItem(name) : null,
				setItem: (name, value) => {
					if (isLocalPersistenceEnabled()) localStorage.setItem(name, value)
				},
				removeItem: (name) => localStorage.removeItem(name),
			})),
			partialize: (state) => ({
				items: state.items,
				commit: state.commit,
				checkedAt: state.checkedAt,
			}),
			merge: (persisted, current) => {
				const raw = (persisted ?? {}) as Record<string, unknown>
				const saved = ('state' in raw
					? (raw.state as Partial<PersistedItemState>)
					: raw) as Partial<PersistedItemState>

				if (saved.items) {
					return { ...current, ...saved, items: saved.items }
				}

				// Первый запуск после переезда с ручного localStorage: переносим
				// старый кэш один раз, дальше живёт только persist-стора.
				const legacy = isLocalPersistenceEnabled() ? readLegacy() : { items: null, commit: null, checkedAt: 0 }
				try {
					localStorage.removeItem(LEGACY_DATA_KEY)
					localStorage.removeItem(LEGACY_COMMIT_KEY)
					localStorage.removeItem(LEGACY_TIME_KEY)
				} catch {
					/* Private mode: keys may be unavailable. */
				}
				if (legacy.items) {
					return { ...current, items: legacy.items, commit: legacy.commit, checkedAt: legacy.checkedAt }
				}
				return current
			},
		}
	)
)