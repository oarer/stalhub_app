'use client'

import { useEffect } from 'react'
import { loadCatalog } from '@/lib/catalogPreload'
import { useItemStore } from '@/stores/items.store'

export function useSearchItem() {
	useEffect(() => {
		// Shared singleton: if the splash is already loading the catalog,
		// this reuses that in-flight request instead of duplicating it.
		void loadCatalog()
	}, [])

	return useItemStore()
}
