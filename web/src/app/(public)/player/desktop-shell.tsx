'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Regions } from '@/types/api.type'
import PlayerView from '@/views/player'
import PlayerSearchView from '@/views/player-search'

// Десктоп: /player (поиск) и /player?region=&character= (профиль).
export default function PlayerDesktopShell() {
	return (
		<Suspense>
			<Inner />
		</Suspense>
	)
}

function Inner() {
	const searchParams = useSearchParams()
	const region = searchParams.get('region')
	const character = searchParams.get('character')
	if (region && character) {
		return <PlayerView character={character} region={region as Regions} />
	}
	return <PlayerSearchView />
}
