'use client'

import { useEffect } from 'react'
import { loadCatalog } from '@/lib/catalogPreload'
import { useItemStore } from '@/stores/items.store'

export function useTradingCatalog() {
	useEffect(() => {
		// Каталог торга читает те же данные, что и остальное приложение:
		// единый стор (persist) и общая in-flight проверка со сплэшем/поиском.
		void loadCatalog()
	}, [])

	return useItemStore()
}
