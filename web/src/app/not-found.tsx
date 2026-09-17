'use client'

import { usePathname } from 'next/navigation'
import NotFoundView from '@/views/errors/notFound/NotFoundView'

export default function NotFound() {
	const path = usePathname()

	return <NotFoundView path={path} />
}
