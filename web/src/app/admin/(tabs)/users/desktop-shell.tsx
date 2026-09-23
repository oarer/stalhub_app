'use client'

import { Suspense } from 'react'
import { notFound, useSearchParams } from 'next/navigation'
import UserDetailView from '@/views/admin/users/UserDetailView'
import AdminUsersView from '@/views/admin/users/UsersAdminView'

// Десктоп: /admin/users (список) и /admin/users?id= (деталь).
export default function AdminUsersDesktopShell() {
	return (
		<Suspense>
			<Inner />
		</Suspense>
	)
}

function Inner() {
	const searchParams = useSearchParams()
	const idParam = searchParams.get('id')
	if (idParam) {
		const userId = Number(idParam)
		if (!Number.isFinite(userId)) notFound()
		return <UserDetailView userId={userId} />
	}
	return <AdminUsersView />
}
