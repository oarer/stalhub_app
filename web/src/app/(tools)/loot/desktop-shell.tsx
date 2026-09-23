'use client'

import { Suspense, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getLootCatalog } from '@/services/calcs/loot.service'
import type { CatalogResponse } from '@/types/loot.type'
import { LootView } from '@/views/calcs/loot/LootView'

// Десктоп: каталог недоступен анонимно на этапе prerender (бэкенд отдаёт
// 404 без сессии), поэтому грузим его на клиенте — там сессия появится
// через Tauri API-мост (Фаза 3). Сайт рендерит каталог на сервере.
export default function LootDesktopShell() {
	return (
		<Suspense>
			<Inner />
		</Suspense>
	)
}

function Inner() {
	const t = useTranslations()
	const [catalog, setCatalog] = useState<CatalogResponse | null>(null)
	const [failed, setFailed] = useState(false)

	useEffect(() => {
		let cancelled = false
		getLootCatalog()
			.then((data) => {
				if (!cancelled) setCatalog(data)
			})
			.catch(() => {
				if (!cancelled) setFailed(true)
			})
		return () => {
			cancelled = true
		}
	}, [])

	if (failed) {
		return (
			<section className="mx-auto flex max-w-7xl flex-col gap-10 px-4 pt-32 pb-12 lg:pt-36">
				<p>{t('buy.loadingError')}</p>
			</section>
		)
	}

	if (!catalog) {
		return (
			<section className="mx-auto flex max-w-7xl flex-col gap-10 px-4 pt-32 pb-12 lg:pt-36">
				<p>{t('buy.loading')}</p>
			</section>
		)
	}

	return <LootView catalog={catalog} />
}
