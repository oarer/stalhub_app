'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import ClansAdminView from '@/views/admin/clans/ClansAdminView'
import ClanAdminDetailView from '@/views/admin/clans/ClanAdminDetailView'

// Десктоп: /admin/clans (список) и /admin/clans?id= (деталь).
export default function AdminClansDesktopShell() {
	return (
		<Suspense>
			<Inner />
		</Suspense>
	)
}

function Inner() {
	const searchParams = useSearchParams()
	const id = searchParams.get('id')
	if (id) return <ClanAdminDetailView clanId={id} />
	return <ClansAdminView />
}
