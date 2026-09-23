import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getQueryClient } from '@/providers/QueryProvider'
import { itemsQueries } from '@/queries/calcs/items.queries'
import BuildsLiteView from '@/views/calcs/builds/lite/BuildsLite'
import { IS_STATIC_EXPORT } from '@/lib/isStaticExport'

export default async function BuildsLitePage() {
	// Десктоп: каталог тянется на клиенте (через мост), без build-time fetch.
	if (IS_STATIC_EXPORT) return <BuildsLiteView />

	const queryClient = getQueryClient()

	await Promise.all([
		queryClient.fetchQuery(itemsQueries.get({ type: 'armor' })),
		queryClient.fetchQuery(itemsQueries.get({ type: 'containers' })),
	])

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<BuildsLiteView />
		</HydrationBoundary>
	)
}
