import { IS_STATIC_EXPORT } from '@/lib/isStaticExport'
import AdminUsersView from '@/views/admin/users/UsersAdminView'
import AdminUsersDesktopShell from './desktop-shell'

export default function AdminUsersPage() {
	if (IS_STATIC_EXPORT) return <AdminUsersDesktopShell />
	return <AdminUsersView />
}
