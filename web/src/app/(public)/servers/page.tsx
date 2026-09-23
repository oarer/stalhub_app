import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getQueryClient } from '@/providers/QueryProvider'
import { serverOnlineQueries } from '@/queries/server-online/server-online.queries'
import ServerStatusView from '@/views/server-status/ServerStatusView'
import { IS_STATIC_EXPORT } from '@/lib/isStaticExport'

export default async function ServerStatusPage() {
	// Десктоп: данные тянутся на клиенте (через мост), без build-time fetch.
	if (IS_STATIC_EXPORT) return <ServerStatusView />

	const queryClient = getQueryClient()

	await Promise.allSettled([
		queryClient.fetchQuery(serverOnlineQueries.latest()),
		queryClient.fetchQuery(serverOnlineQueries.history(24)),
	])

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<ServerStatusView />
		</HydrationBoundary>
	)
}
