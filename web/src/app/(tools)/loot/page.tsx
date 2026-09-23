import { IS_STATIC_EXPORT } from '@/lib/isStaticExport'
import { getLootCatalogCached } from '@/services/calcs/loot.server'
import { LootView } from '@/views/calcs/loot/LootView'
import LootDesktopShell from './desktop-shell'

export default async function LootPage() {
	// Десктоп: каталог недоступен анонимно на prerender — грузим на клиенте.
	if (IS_STATIC_EXPORT) return <LootDesktopShell />

	const catalog = await getLootCatalogCached()
	return <LootView catalog={catalog} />
}
