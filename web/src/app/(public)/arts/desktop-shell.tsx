'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import ArtsView from '@/views/arts/ArtsView'
import ArtView from '@/views/arts/ArtView'

// Десктоп: /arts (список, ?search= поддерживается) и /arts?id= (деталь).
export default function ArtsDesktopShell() {
	return (
		<Suspense>
			<Inner />
		</Suspense>
	)
}

function Inner() {
	const searchParams = useSearchParams()
	const id = searchParams.get('id')
	if (id) return <ArtView artId={id} />
	return <ArtsView />
}
