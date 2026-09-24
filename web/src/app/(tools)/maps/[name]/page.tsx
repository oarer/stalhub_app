import { readFile } from 'node:fs/promises'
import path from 'node:path'
import MapView from '@/views/maps/map/MapView'

// Карты конечны (public/maps.json) — static export пререндерит их напрямую,
// path-схема сохраняется и на сайте, и в десктопе.
export async function generateStaticParams(): Promise<{ name: string }[]> {
	try {
		const raw = await readFile(
			path.join(process.cwd(), 'public', 'maps.json'),
			'utf8'
		)
		const data = JSON.parse(raw) as { maps?: { name: string }[] }
		return (data.maps ?? []).map((m) => ({ name: m.name }))
	} catch {
		return []
	}
}

export default async function MapPage({
	params,
}: {
	params: Promise<{ name: string }>
}) {
	const { name } = await params

	return <MapView mapName={name} />
}
