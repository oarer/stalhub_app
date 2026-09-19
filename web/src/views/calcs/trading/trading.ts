import Fuse from 'fuse.js'

export type TradingRow = { name: string; count: number }
export type MatchedRow = TradingRow & { id: string | null }
export type CatalogEntry = { id: string; name: string }
export type Point = { x: number; y: number }
export type Selection = Point & { width: number; height: number }

export function itemCatalogId(data: string): string | null {
	const id = data.split('/').pop()?.replace(/\.json$/, '')
	return id || null
}

const normalize = (name: string) =>
	name
		.normalize('NFKC')
		.toLocaleLowerCase()
		.replace(/ё/g, 'е')
		.replace(/\s+/g, ' ')
		.trim()

// A row is a name followed by an optional quantity. Keep internal model/caliber numbers.
export function parseTradingText(text: string): TradingRow[] {
	return text.split(/\r?\n/).flatMap((line) => {
		const value = line.trim()
		if (!/\p{L}/u.test(value)) return []
		const quantity =
			value.match(
				/^(.*?)\s+(?:[xх×]\s*)?(-?\d[\d\s.,]*)(?:\s*(?:шт\.?|pcs\.?))?$/iu
			) ?? value.match(/^(.*?)[xх×]\s*(\d+)$/iu)
		const name = (quantity?.[1] ?? value).trim()
		const count = quantity ? Number(quantity[2].replace(/\s/g, '')) : 1
		if (!name || !Number.isSafeInteger(count) || count <= 0) return []
		return [{ name, count }]
	})
}

export function createMatcher(catalog: CatalogEntry[]) {
	const entries = catalog.map((item) => ({
		...item,
		normalized: normalize(item.name),
	}))
	const fuse = new Fuse(entries, {
		keys: ['normalized'],
		threshold: 0.28,
		includeScore: true,
		ignoreLocation: true,
	})
	return (row: TradingRow): MatchedRow => {
		const query = normalize(row.name)
		const matches = fuse.search(query)
		const first = matches[0]
		const second = matches.find((entry) => entry.item.id !== first?.item.id)
		const certain =
			query.length >= 3 &&
			first &&
			(first.score ?? 1) <= 0.28 &&
			(!second || (second.score ?? 1) - (first.score ?? 0) >= 0.08)
		return certain
			? { name: first.item.name, count: row.count, id: first.item.id }
			: { ...row, id: null }
	}
}

export function selectionRect(start: Point, end: Point): Selection {
	const clamp = (value: number) => Math.max(0, Math.min(1, value))
	const x = Math.min(clamp(start.x), clamp(end.x))
	const y = Math.min(clamp(start.y), clamp(end.y))
	return {
		x,
		y,
		width: Math.max(clamp(start.x), clamp(end.x)) - x,
		height: Math.max(clamp(start.y), clamp(end.y)) - y,
	}
}
