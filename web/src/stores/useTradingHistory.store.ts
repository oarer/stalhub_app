import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { MatchedRow } from '@/views/calcs/trading/trading'

export type TradeDealReason = 'success' | 'manual'

export interface TradeDeal {
	id: string
	player: string
	items: MatchedRow[]
	total: number | null
	completedAt: number
	reason: TradeDealReason
}

interface TradingHistoryState {
	deals: TradeDeal[]

	addDeal: (deal: Omit<TradeDeal, 'id'>) => void
	removeDeal: (id: string) => void
	clearDeals: () => void
}

export const useTradingHistoryStore = create<TradingHistoryState>()(
	persist(
		(set) => ({
			deals: [],

			addDeal: (deal) =>
				set((state) => ({
					deals: [
						{
							...deal,
							id: `${deal.completedAt}-${Math.random()
								.toString(36)
								.slice(2, 8)}`,
						},
						...state.deals,
					].slice(0, 50),
				})),
			removeDeal: (id) =>
				set((state) => ({
					deals: state.deals.filter((deal) => deal.id !== id),
				})),
			clearDeals: () => set({ deals: [] }),
		}),
		{ name: 'trading-history-v1', version: 1 }
	)
)