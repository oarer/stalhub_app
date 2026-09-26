'use client'

import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { type ReactNode, useEffect } from 'react'
import { userQueries } from '@/queries/user/user.queries'

export default function AdminGate({ children }: { children: ReactNode }) {
	const router = useRouter()
	const session = useQuery(userQueries.getMe())
	const status = (session.error as { response?: { status?: number } } | null)
		?.response?.status
	const needsLogin = status === 401
	const isAdmin = session.data?.roles?.some((role) => role.name === 'ADMIN')

	useEffect(() => {
		if (needsLogin) router.replace('/auth')
		else if (session.data && !isAdmin) router.replace('/')
	}, [needsLogin, session.data, isAdmin, router])

	if (session.isPending || needsLogin || (session.data && !isAdmin)) {
		return (
			<main aria-busy="true" className="pt-12 text-center">
				…
			</main>
		)
	}
	if (session.isError) throw session.error
	return children
}
