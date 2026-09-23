import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getQueryClient } from '@/providers/QueryProvider'
import { articleQueries } from '@/queries/article/article.queries'
import ArticlesView from '@/views/articles/ArticlesView'
import { IS_STATIC_EXPORT } from '@/lib/isStaticExport'
import ArticlesDesktopShell from './desktop-shell'

export default async function ArticlesPage() {
	// Десктоп: клиентский рендер (список/деталь по ?id=), без build-time fetch.
	if (IS_STATIC_EXPORT) return <ArticlesDesktopShell />

	const queryClient = getQueryClient()

	await queryClient.fetchQuery(
		articleQueries.publicList({ take: 20, page: 1 })
	)

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<ArticlesView />
		</HydrationBoundary>
	)
}
