import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getQueryClient } from '@/providers/QueryProvider'
import { balanceDiffQueries } from '@/queries/balance/balance.queries'
import BalanceView from '@/views/balance/BalanceView'
import { IS_STATIC_EXPORT } from '@/lib/isStaticExport'

export default async function BalancePage() {
	// Десктоп: данные тянутся на клиенте (через мост), без build-time fetch.
	if (IS_STATIC_EXPORT) return <BalanceView />

	const queryClient = getQueryClient()

	await queryClient.fetchQuery(balanceDiffQueries.latest())

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<BalanceView />
		</HydrationBoundary>
	)
}
