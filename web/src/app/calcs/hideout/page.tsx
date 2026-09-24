import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getQueryClient } from '@/providers/QueryProvider'
import { hideoutQueries } from '@/queries/calcs/hideout.queries'
import { HideoutView } from '@/views/calcs/hideout/HideoutView'
import { IS_STATIC_EXPORT } from '@/lib/isStaticExport'

export default async function HideoutPage() {
	// Десктоп: данные тянутся на клиенте (через мост), без build-time fetch.
	if (IS_STATIC_EXPORT) return <HideoutView />

	const queryClient = getQueryClient()

	queryClient.fetchQuery(hideoutQueries.get())

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<HideoutView />
		</HydrationBoundary>
	)
}
