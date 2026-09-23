import { notFound } from 'next/navigation'
import { IS_STATIC_EXPORT } from '@/lib/isStaticExport'
import ItemsDesktopShell from './desktop-shell'

// Десктоп: query-схема /items?slug=.... На сайте этого роута нет
// (там /items/[...slug]), поэтому site-сборка отвечает 404.
export default function ItemsPage() {
	if (!IS_STATIC_EXPORT) notFound()
	return <ItemsDesktopShell />
}
