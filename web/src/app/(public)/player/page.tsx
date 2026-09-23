import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getQueryClient } from '@/providers/QueryProvider'
import { playerQueries } from '@/queries/player/player.queries'
import PlayerSearchView from '@/views/player-search'
import { IS_STATIC_EXPORT } from '@/lib/isStaticExport'
import PlayerDesktopShell from './desktop-shell'

export default async function PlayerSearchPage() {
	// Десктоп: клиентский рендер (поиск/профиль по ?region=&character=).
	if (IS_STATIC_EXPORT) return <PlayerDesktopShell />

	const queryClient = getQueryClient()

	await Promise.allSettled([
		queryClient.fetchQuery(playerQueries.getPopular()),
		queryClient.fetchQuery(playerQueries.getRecent()),
	])

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<PlayerSearchView />
		</HydrationBoundary>
	)
}
