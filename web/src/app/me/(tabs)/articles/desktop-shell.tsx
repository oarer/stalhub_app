'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import ArticleEditorView from '@/views/me/ArticleEditorView'
import MeArticlesView from '@/views/me/MeArticlesView'

// Десктоп: /me/articles (список) и /me/articles?edit= (редактор).
export default function MeArticlesDesktopShell() {
	return (
		<Suspense>
			<Inner />
		</Suspense>
	)
}

function Inner() {
	const searchParams = useSearchParams()
	const edit = searchParams.get('edit')
	if (edit) return <ArticleEditorView articleId={edit} />
	return <MeArticlesView />
}
