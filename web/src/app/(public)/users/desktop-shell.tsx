'use client'

import { Suspense } from 'react'
import { notFound, useSearchParams } from 'next/navigation'
import UserProfileView from '@/views/users/UserProfileView'

// Десктоп (Tauri, static export): /users?id=123 или /users?username=name.
// Сайт использует path-схему /users/[id] (SEO) — см. desktop-href.ts.
export default function UsersDesktopShell() {
	return (
		<Suspense>
			<Inner />
		</Suspense>
	)
}

function Inner() {
	const searchParams = useSearchParams()
	const idParam = searchParams.get('id')
	const username = searchParams.get('username')
	const numericId =
		idParam && /^\d+$/.test(idParam) ? Number(idParam) : null

	if (numericId === null && !username) notFound()

	return (
		<UserProfileView
			id={numericId}
			username={numericId === null ? username : null}
		/>
	)
}
