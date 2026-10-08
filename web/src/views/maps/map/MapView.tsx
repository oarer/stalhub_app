'use client'

import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { WORLD_MAP } from '@/constants/map.const'
import { useMaps } from '@/hooks/useMaps'
import type { MapConfig } from '@/types/map.type'

function Loading() {
	const t = useTranslations()
	return (
		<section className="relative mx-auto mt-26 mb-12 flex max-w-380 flex-col gap-10 px-4 pt-12 xl:mt-0 dark:text-white/70">
			<div className="mx-auto flex items-center gap-4 xl:px-0 xl:pt-42.5 xl:pb-15">
				<p className="font-semibold text-2xl">{t('map.loading')}</p>
			</div>
		</section>
	)
}

const MapTile = dynamic(() => import('./components/MapTile'), {
	ssr: false,
	loading: () => <Loading />,
})

export default function MapView({ mapName }: { mapName?: string }) {
	const { maps } = useMaps()
	const t = useTranslations()

	// Десктоп: несколько карт (public/maps.json) через /maps/[name].
	// Без mapName — мировая карта как на сайте.
	let mapConfig: MapConfig | undefined
	if (mapName) {
		mapConfig = maps.find((m: MapConfig) => m.name === mapName)
		if (!mapConfig) return <p>{t('map.notFound', { mapName })}</p>
	}

	const config = mapConfig ?? WORLD_MAP

	return (
		<MapTile
			atlasMarkers={config.atlasMarkers === true}
			fullMaxLevel={config.image.maxZoom}
			imageHeight={config.image.height}
			imageWidth={config.image.width}
			mapName={config.name}
			markersUrl={config.markers}
			url={config.url}
		/>
	)
}
