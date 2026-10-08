'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'
import { IS_STATIC_EXPORT } from '@/lib/isStaticExport'
import { publicWebsiteUrl } from '@/lib/publicWebsiteUrl'
import type { DownloadRelease } from '@/types/download.type'
import Hero from './sections/Hero'

const Releases = dynamic(() => import('./sections/Releases'))
const Transfer = dynamic(() => import('./sections/Transfer'))

export default function DownloadView() {
	const [releases, setReleases] = useState<DownloadRelease[]>([])
	const [loading, setLoading] = useState(true)
	const [hasError, setHasError] = useState(false)

	const loadReleases = useCallback(async () => {
		setLoading(true)
		setHasError(false)
		try {
			// Десктоп (static export): /api/download не собирается,
			// тянем релизы напрямую с публичного сайта.
			const url = IS_STATIC_EXPORT
				? publicWebsiteUrl('/api/download/releases')
				: '/api/download/releases'
			const res = await fetch(url)
			if (!res.ok) throw new Error(String(res.status))
			const data = (await res.json()) as DownloadRelease[]
			setReleases(data)
		} catch {
			setHasError(true)
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		void loadReleases()
	}, [loadReleases])

	const latest = releases[0] ?? null

	return (
		<div className="mx-auto flex max-w-6xl flex-col gap-16 px-4 pt-32 pb-12 sm:px-6">
			<Hero
				hasError={hasError}
				latest={latest}
				loading={loading}
				onReload={() => void loadReleases()}
			/>
			<Releases
				hasError={hasError}
				loading={loading}
				onReload={() => void loadReleases()}
				releases={releases}
			/>
			<Transfer />
		</div>
	)
}
