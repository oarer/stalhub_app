'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import ArtEditView from '@/views/me/arts/ArtEditView'
import MeArtsView from '@/views/me/arts/MeArtsView'

// Десктоп: /me/arts (список) и /me/arts?edit= (редактор).
export default function MeArtsDesktopShell() {
	return (
		<Suspense>
			<Inner />
		</Suspense>
	)
}

function Inner() {
	const searchParams = useSearchParams()
	const edit = searchParams.get('edit')
	if (edit) return <ArtEditView artId={edit} />
	return <MeArtsView />
}
