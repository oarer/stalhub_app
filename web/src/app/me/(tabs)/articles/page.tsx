import { IS_STATIC_EXPORT } from '@/lib/isStaticExport'
import MeArticlesView from '@/views/me/MeArticlesView'
import MeArticlesDesktopShell from './desktop-shell'

export default function Page() {
	if (IS_STATIC_EXPORT) return <MeArticlesDesktopShell />
	return <MeArticlesView />
}
