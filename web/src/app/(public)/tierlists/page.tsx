import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getQueryClient } from '@/providers/QueryProvider'
import { tierListQueries } from '@/queries/tier-list/tier-list.queries'
import TierListsView from '@/views/tierlists/TierListsView'
import { IS_STATIC_EXPORT } from '@/lib/isStaticExport'
import TierListsDesktopShell from './desktop-shell'

export default async function TierListsPage() {
	// Десктоп: клиентский рендер (список/деталь/редактор по ?id=&edit=).
	if (IS_STATIC_EXPORT) return <TierListsDesktopShell />

	const queryClient = getQueryClient()

	await queryClient.fetchQuery(tierListQueries.list({ take: 24, page: 1 }))

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<TierListsView />
		</HydrationBoundary>
	)
}
