'use client'

import { Suspense } from 'react'
import { notFound, useSearchParams } from 'next/navigation'
import ItemsView from '@/views/items'

// Десктоп (Tauri, static export): /items?slug=weapon/ak-....
// Сайт использует path-схему /items/[...slug] (SEO) — см. desktop-href.ts.
export default function ItemsDesktopShell() {
	return (
		<Suspense>
			<Inner />
		</Suspense>
	)
}

function Inner() {
	const searchParams = useSearchParams()
	const slug = searchParams.get('slug')
	if (!slug) notFound()

	const path = slug.split('/').filter(Boolean)
	if (path.length === 0) notFound()

	const id = path[path.length - 1]
	const githubUrl = `${path.join('/')}.json`

	return <ItemsView githubUrl={githubUrl} id={id} path={path} />
}
