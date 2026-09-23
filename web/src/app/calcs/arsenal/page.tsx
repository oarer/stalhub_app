import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getQueryClient } from '@/providers/QueryProvider'
import { arsenalQueries } from '@/queries/calcs/arsenal.queries'
import { ArsenalView } from '@/views/calcs/arsenal/ArsenalView'
import { IS_STATIC_EXPORT } from '@/lib/isStaticExport'

export default async function ArsenalPage() {
	// Десктоп: данные тянутся на клиенте (через мост), без build-time fetch.
	if (IS_STATIC_EXPORT) return <ArsenalView />

	const queryClient = getQueryClient()

	queryClient.fetchQuery(arsenalQueries.get())

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<ArsenalView />
		</HydrationBoundary>
	)
}
