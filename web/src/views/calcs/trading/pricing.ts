import type { MatchedRow } from './trading'

export function parseAmount(text: string): number | null {
	if (/[\r\n]/.test(text.trim())) return null
	const value = text
		.trim()
		.replace(/\s*(?:₽|руб\.?|rub)\s*$/iu, '')
		.trim()
	if (!/^(?:\d+|\d{1,3}(?:[\s\u00a0]\d{3})+)$/.test(value)) return null
	const amount = Number(value.replace(/\s/g, ''))
	return Number.isSafeInteger(amount) && amount >= 0 ? amount : null
}

export function validatePrices(value: unknown): Record<string, number> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
	return Object.fromEntries(
		Object.entries(value).filter(
			([id, price]) =>
				/^[a-z0-9_-]+$/i.test(id) &&
				typeof price === 'number' &&
				Number.isSafeInteger(price) &&
				price >= 0
		)
	)
}

export function tradeTotal(
	rows: MatchedRow[],
	prices: Record<string, number>
): number | null {
	if (!rows.length) return null
	let total = 0
	for (const row of rows) {
		if (
			!row.id ||
			!Object.hasOwn(prices, row.id) ||
			!Number.isSafeInteger(row.count) ||
			row.count <= 0
		)
			return null
		const price = prices[row.id]
		if (!Number.isSafeInteger(price) || price < 0) return null
		total += price * row.count
		if (!Number.isSafeInteger(total)) return null
	}
	return total
}

export function tradePartialTotal(
	rows: MatchedRow[],
	prices: Record<string, number>
): number | null {
	let total = 0
	let priced = 0
	for (const row of rows) {
		if (!row.id || !Object.hasOwn(prices, row.id)) continue
		if (!Number.isSafeInteger(row.count) || row.count <= 0) continue
		const price = prices[row.id]
		if (!Number.isSafeInteger(price) || price < 0) continue
		priced++
		total += price * row.count
		if (!Number.isSafeInteger(total)) return null
	}
	return priced ? total : null
}
