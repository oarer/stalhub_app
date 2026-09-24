'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import TierListEditorView from '@/views/tierlists/TierListEditorView'
import TierListsView from '@/views/tierlists/TierListsView'

// Десктоп: /me/tierlists (список) и /me/tierlists?edit= (редактор).
export default function MeTierListsDesktopShell() {
	return (
		<Suspense>
			<Inner />
		</Suspense>
	)
}

function Inner() {
	const searchParams = useSearchParams()
	const edit = searchParams.get('edit')
	if (edit) return <TierListEditorView editIdProp={edit} />
	return <TierListsView mine />
}
