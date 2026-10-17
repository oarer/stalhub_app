import type { BlockerRegion } from '@/types/server-blocker.type'

export const BLOCKER_REGION_LABEL_KEYS: Record<BlockerRegion, string> = {
	RU: 'serverBlocker.regions.RU',
	EU: 'serverBlocker.regions.EU',
	NA: 'serverBlocker.regions.NA',
	NEA: 'serverBlocker.regions.NEA',
	SEA: 'serverBlocker.regions.SEA',
}

const POOL_COORDS: Record<string, [number, number]> = {
	'CLOUD-RU-7': [55.75, 37.61],
	MSK1: [55.86, 37.61],
	MSK2: [55.68, 37.61],
	MSK2X: [55.75, 37.78],
	SPB3: [59.93, 30.33],
	NSK1: [55.03, 82.92],
	TAS: [41.31, 69.24],

	SE: [59.4, 17.5],
	EKB: [56.83, 60.6],
	SMR: [53.19, 50.12],
	RST: [47.22, 39.72],
	KRY: [45.03, 38.97],
	KHB: [48.48, 135.07],
	AST: [51.16, 71.42],
	TYO: [35.68, 139.69],
	KOR: [37.56, 126.97],
	SGP: [1.35, 103.82],
	SYD: [-33.87, 151.21],
	FRA: [50.11, 8.68],
	KYI: [50.45, 30.52],
	WAW: [52.23, 21.01],
	MAD: [40.42, -3.7],
	SOF: [42.7, 23.32],
	DAL: [32.78, -96.8],
	NYC: [40.71, -74.0],
	LAX: [34.05, -118.24],
	MIA: [25.76, -80.19],
	CHI: [41.88, -87.63],
	ASH: [39.04, -77.49],
	ATL: [33.75, -84.39],
	DEN: [39.74, -104.99],
	SEA: [47.61, -122.33],
	TOR: [43.65, -79.38],
	SAN: [37.77, -122.41],
	LIM: [-12.05, -77.04],
}

const REGION_CENTER: Record<BlockerRegion, [number, number]> = {
	RU: [55.75, 60],
	EU: [50, 15],
	NA: [39, -98],
	NEA: [37, 133],
	SEA: [-10, 130],
}

export function poolCoords(
	poolName: string,
	index: number,
	region: BlockerRegion,
	raw = false
): [number, number] {
	const base = POOL_COORDS[poolName] ?? REGION_CENTER[region]
	if (raw) return [base[0], base[1]]
	const jitter = (index % 5) * 0.9
	return [base[0] + jitter * 0.4, base[1] + jitter * 0.6]
}

export function pingTone(ms: number | null | undefined): string {
	if (ms == null) return 'text-muted-foreground'
	if (ms < 80) return 'text-success'
	if (ms < 150) return 'text-warning'
	return 'text-destructive'
}

export function formatPing(ms: number | null | undefined): string {
	if (ms == null) return '—'
	return `${ms} ms`
}
