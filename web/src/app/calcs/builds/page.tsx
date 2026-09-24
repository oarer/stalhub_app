import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getQueryClient } from '@/providers/QueryProvider'
import { itemsQueries } from '@/queries/calcs/items.queries'
import { BuildsView } from '@/views/calcs/builds/model'
import { IS_STATIC_EXPORT } from '@/lib/isStaticExport'

export default async function BuildsPage() {
	// Десктоп: каталог тянется на клиенте (через мост), без build-time fetch.
	if (IS_STATIC_EXPORT) return <BuildsView />

	const queryClient = getQueryClient()

	await queryClient.fetchQuery(itemsQueries.get({ type: 'armor' }))
	await queryClient.fetchQuery(itemsQueries.get({ type: 'containers' }))

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<BuildsView />
		</HydrationBoundary>
	)
}
