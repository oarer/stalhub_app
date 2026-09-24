import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getQueryClient } from '@/providers/QueryProvider'
import { itemsQueries } from '@/queries/calcs/items.queries'
import { TTKView } from '@/views/calcs/ttk/TTKView'
import { IS_STATIC_EXPORT } from '@/lib/isStaticExport'

export default async function TTKPage() {
	// Десктоп: каталоги тянутся на клиенте (через мост), без build-time fetch.
	if (IS_STATIC_EXPORT) return <TTKView />

	const queryClient = getQueryClient()

	await Promise.all([
		queryClient.fetchQuery(itemsQueries.get({ type: 'weapons' })),
		queryClient.fetchQuery(itemsQueries.get({ type: 'ammo' })),
		queryClient.fetchQuery(itemsQueries.get({ type: 'plates' })),
		queryClient.fetchQuery(itemsQueries.get({ type: 'armor' })),
		queryClient.fetchQuery(itemsQueries.get({ type: 'containers' })),
		queryClient.fetchQuery(itemsQueries.get({ type: 'artefact' })),
		queryClient.fetchQuery(itemsQueries.get({ type: 'consumables' })),
	])

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<TTKView />
		</HydrationBoundary>
	)
}
