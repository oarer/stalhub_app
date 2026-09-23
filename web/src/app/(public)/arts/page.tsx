import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getQueryClient } from '@/providers/QueryProvider'
import { artQueries } from '@/queries/art/art.queries'
import ArtsView from '@/views/arts/ArtsView'
import { IS_STATIC_EXPORT } from '@/lib/isStaticExport'
import ArtsDesktopShell from './desktop-shell'

export default async function ArtsPage() {
	// Десктоп: клиентский рендер (список/деталь по ?id=), без build-time fetch.
	if (IS_STATIC_EXPORT) return <ArtsDesktopShell />

	const queryClient = getQueryClient()

	await queryClient.fetchQuery(artQueries.publicList({ take: 24, page: 1 }))

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<ArtsView />
		</HydrationBoundary>
	)
}
