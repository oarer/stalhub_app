import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { validatePrices } from '@/views/calcs/trading/pricing'

// Legacy manual-storage key replaced by the persisted store below.
const LEGACY_PRICES_KEY = 'trading-prices-v1'

interface TradingPricesState {
	prices: Record<string, number>

	setPrice: (id: string, price: number) => void
	addItem: (id: string) => void
	removeItem: (id: string) => void
}

const readLegacyPrices = (): Record<string, number> => {
	try {
		const raw = localStorage.getItem(LEGACY_PRICES_KEY)
		if (raw === null) return {}
		return validatePrices(JSON.parse(raw))
	} catch {
		return {}
	}
}

export const useTradingPricesStore = create<TradingPricesState>()(
	persist(
		(set) => ({
			prices: {},

			setPrice: (id, price) =>
				set((state) => ({ prices: { ...state.prices, [id]: price } })),
			addItem: (id) =>
				set((state) => {
					if (Object.hasOwn(state.prices, id)) return state
					return { prices: { ...state.prices, [id]: 0 } }
				}),
			removeItem: (id) =>
				set((state) => {
					const prices = { ...state.prices }
					delete prices[id]
					return { prices }
				}),
		}),
		{
			name: 'trading-prices-v2',
			version: 2,
			merge: (persisted, current) => {
				// The very first hydration has no persisted blob: adopt the legacy
				// manual-storage key once, then drop it so stale values never win.
				if (
					persisted &&
					typeof persisted === 'object' &&
					'prices' in persisted
				) {
					return {
						...current,
						prices: validatePrices(
							(persisted as { prices: unknown }).prices
						),
					}
				}
				const legacy = readLegacyPrices()
				try {
					localStorage.removeItem(LEGACY_PRICES_KEY)
				} catch {
					/* Legacy key may be unavailable (private mode). */
				}
				if (Object.keys(legacy).length === 0) return current
				return { ...current, prices: { ...current.prices, ...legacy } }
			},
		}
	)
)