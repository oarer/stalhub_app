import { deepStrictEqual } from 'node:assert'
import { describe, test } from 'node:test'

const expect = (actual: unknown) => ({
	toEqual: (expected: unknown) => deepStrictEqual(actual, expected),
	toBe: (expected: unknown) => deepStrictEqual(actual, expected),
	toBeNull: () => deepStrictEqual(actual, null),
})

import {
	createMatcher,
	parseTradeStatus,
	parseTradingText,
	selectionRect,
} from './trading'

describe('trading OCR', () => {
	test('parses explicit counts without corrupting numbers in names', () => {
		expect(
			parseTradingText(
				'АК-74 x2\nПатрон 9 мм 120\nБинт 1 200 шт.\nАК-74\n\n42'
			)
		).toEqual([
			{ name: 'АК-74', count: 2 },
			{ name: 'Патрон 9 мм', count: 120 },
			{ name: 'Бинт', count: 1200 },
			{ name: 'АК-74', count: 1 },
		])
	})
	test('does not invent counts for zero, negative, decimal or unsafe quantities', () => {
		expect(
			parseTradingText(
				'Бинт x0\nБинт -2\nБинт 1.5\nБинт 99999999999999999999'
			)
		).toEqual([])
	})
	test('matches typos but preserves unknown and ambiguous names', () => {
		const match = createMatcher([
			{ id: 'a', name: 'Аптечка армейская' },
			{ id: 'b', name: 'Бинт' },
			{ id: 'c', name: 'Бинт' },
		])
		expect(match({ name: 'Аптечка армейскоя', count: 2 }).id).toBe('a')
		expect(match({ name: 'Бинт', count: 3 }).id).toBeNull()
		expect(match({ name: 'Нераспознанный предмет', count: 1 })).toEqual({
			name: 'Нераспознанный предмет',
			count: 1,
			id: null,
		})
	})
	test('normalizes reversed selections and clamps coordinates', () => {
		expect(selectionRect({ x: 0.8, y: 0.9 }, { x: -0.1, y: 0.2 })).toEqual({
			x: 0,
			y: 0.2,
			width: 0.8,
			height: 0.7,
		})
	})
})

describe('trade status OCR', () => {
	test('detects a successful trade', () => {
		expect(parseTradeStatus('Успешно!')).toBe('success')
		expect(parseTradeStatus('  успешно  ')).toBe('success')
		expect(parseTradeStatus('Success')).toBe('success')
	})
	test('detects a pending agreement separator', () => {
		expect(parseTradeStatus('---')).toBe('agreement')
		expect(parseTradeStatus('_|_')).toBe('agreement')
	})
	test('empty status regions stay idle and noise stays unknown', () => {
		expect(parseTradeStatus('')).toBe('idle')
		expect(parseTradeStatus('Крафт интерфейс')).toBe('unknown')
	})
})
