import { IS_STATIC_EXPORT } from '@/lib/isStaticExport'
import MeArtsView from '@/views/me/arts/MeArtsView'
import MeArtsDesktopShell from './desktop-shell'

export default function Page() {
	if (IS_STATIC_EXPORT) return <MeArtsDesktopShell />
	return <MeArtsView />
}
