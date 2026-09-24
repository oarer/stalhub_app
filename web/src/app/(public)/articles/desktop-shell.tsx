'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import ArticleView from '@/views/articles/ArticleView'
import ArticlesView from '@/views/articles/ArticlesView'

// Десктоп: /articles (список) и /articles?id= (деталь).
export default function ArticlesDesktopShell() {
	return (
		<Suspense>
			<Inner />
		</Suspense>
	)
}

function Inner() {
	const searchParams = useSearchParams()
	const id = searchParams.get('id')
	if (id) return <ArticleView articleId={id} />
	return <ArticlesView />
}
