'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import TierListDetailView from '@/views/tierlists/TierListDetailView'
import TierListEditorView from '@/views/tierlists/TierListEditorView'
import TierListsView from '@/views/tierlists/TierListsView'

// Десктоп: /tierlists (список), /tierlists?id= (деталь),
// /tierlists?id=&edit=1 (редактор).
export default function TierListsDesktopShell() {
	return (
		<Suspense>
			<Inner />
		</Suspense>
	)
}

function Inner() {
	const searchParams = useSearchParams()
	const id = searchParams.get('id')
	const edit = searchParams.get('edit')
	if (id && edit) return <TierListEditorView editIdProp={id} />
	if (id) return <TierListDetailView detailId={id} />
	return <TierListsView />
}
