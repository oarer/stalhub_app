import { IS_STATIC_EXPORT } from '@/lib/isStaticExport'
import ClansAdminView from '@/views/admin/clans/ClansAdminView'
import AdminClansDesktopShell from './desktop-shell'

export default function AdminClansPage() {
	if (IS_STATIC_EXPORT) return <AdminClansDesktopShell />
	return <ClansAdminView />
}
