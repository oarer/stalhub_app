import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getQueryClient } from '@/providers/QueryProvider'
import { clanQueries } from '@/queries/clan/clan.queries'
import ClanCatalogView from '@/views/clans/ClanCatalogView'
import { IS_STATIC_EXPORT } from '@/lib/isStaticExport'

export default async function ClansPage() {
	// Десктоп: данные тянутся на клиенте (через мост), без build-time fetch.
	if (IS_STATIC_EXPORT) return <ClanCatalogView />

	const queryClient = getQueryClient()

	await queryClient.fetchQuery(clanQueries.getPublicClans())

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<ClanCatalogView />
		</HydrationBoundary>
	)
}
