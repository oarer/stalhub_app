import { notFound } from 'next/navigation'
import { IS_STATIC_EXPORT } from '@/lib/isStaticExport'
import UsersDesktopShell from './desktop-shell'

// Десктоп: query-схема /users?id=123. На сайте этого роута нет
// (там /users/[id]), поэтому site-сборка отвечает 404.
export default function UsersPage() {
	if (!IS_STATIC_EXPORT) notFound()
	return <UsersDesktopShell />
}
