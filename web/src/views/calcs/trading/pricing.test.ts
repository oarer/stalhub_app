import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
	parseAmount,
	tradePartialTotal,
	tradeTotal,
	validatePrices,
} from './pricing'

test('amounts reject OCR noise, decimals and multiple lines of numbers', () => {
	assert.equal(parseAmount('1 200 ₽'), 1200)
	assert.equal(parseAmount('0'), 0)
	for (const text of ['', '1O0', '-10', '1.50', '100\n200', '100 20'])
		assert.equal(parseAmount(text), null)
})
test('totals require known IDs and prices for every row', () => {
	const rows = [
		{ id: 'a', name: 'A', count: 2 },
		{ id: 'b', name: 'B', count: 3 },
	]
	assert.equal(tradeTotal(rows, { a: 10, b: 20 }), 80)
	assert.equal(tradeTotal(rows, { a: 10 }), null)
	assert.equal(tradeTotal([{ id: null, name: '?', count: 1 }], {}), null)
	assert.equal(tradeTotal([], {}), null)
	assert.equal(tradeTotal(rows, { a: Number.MAX_SAFE_INTEGER, b: 0 }), null)
	assert.deepEqual(validatePrices({ a: 0, b: -1, c: '10', d: 1.1 }), { a: 0 })
})
test('partial totals sum only the priced, matched rows', () => {
	const rows = [
		{ id: 'a', name: 'A', count: 2 },
		{ id: 'b', name: 'B', count: 3 },
		{ id: null, name: '?', count: 4 },
	]
	assert.equal(tradePartialTotal(rows, { a: 10 }), 20)
	assert.equal(tradePartialTotal(rows, { a: 10, b: 20 }), 80)
	assert.equal(tradePartialTotal(rows, {}), null)
	assert.equal(tradePartialTotal([], {}), null)
	assert.equal(
		tradePartialTotal(rows, { a: Number.MAX_SAFE_INTEGER }),
		null
	)
})
