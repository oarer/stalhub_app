'use client'

import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { userQueries } from '@/queries/user/user.queries'

export default function SessionGate({ children }: { children: ReactNode }) {
 const router = useRouter()
 const session = useQuery(userQueries.getMe())
 const status = (session.error as { response?: { status?: number } } | null)?.response?.status
 const needsLogin = status === 401
 useEffect(() => { if (needsLogin) router.replace('/auth') }, [needsLogin, router])
 if (session.isPending || needsLogin) return <main className="pt-32 text-center" aria-busy="true">…</main>
 if (session.isError) throw session.error
 return children
}
