import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { isLand } from './landmask'

// Города-пулы серверов обязаны лежать на суше, иначе маркеры снова
// окажутся не на тех континентах (регрессия: сдвиг долготы на 180°).
// Допуск 1°: точка NYC — это гавань (вода), Сидней — прибрежная клетка.
test('server pool cities are on land', () => {
	const cities: Array<[string, number, number]> = [
		['Moscow', 55.75, 37.61],
		['Saint Petersburg', 59.93, 30.33],
		['Novosibirsk', 55.03, 82.92],
		['Frankfurt', 50.11, 8.68],
		['Warsaw', 52.23, 21.01],
		['New York', 40.71, -74.0],
		['Dallas', 32.78, -96.8],
		['Tokyo', 35.68, 139.69],
		['Singapore', 1.35, 103.82],
		['Australia inland', -33.5, 150.5],
	]
	for (const [name, lat, lng] of cities) {
		let land = false
		for (const dLat of [-1, 0, 1]) {
			for (const dLng of [-1, 0, 1]) {
				if (isLand(lat + dLat, lng + dLng)) land = true
			}
		}
		assert.equal(land, true, `${name} (${lat}, ${lng}) should be near land`)
	}
})

test('open oceans are water', () => {
	const waters: Array<[string, number, number]> = [
		['Pacific', 0, -160],
		['Atlantic', 30, -40],
		['Gulf of Guinea', 0, 0],
		['Indian', -30, 90],
	]
	for (const [name, lat, lng] of waters) {
		assert.equal(
			isLand(lat, lng),
			false,
			`${name} (${lat}, ${lng}) should be water`
		)
	}
})

test('longitude wraps around the antimeridian', () => {
	// Один и тот же меридиан, записанный по-разному.
	assert.equal(isLand(55.75, 37.61), isLand(55.75, 37.61 - 360))
	assert.equal(isLand(40.71, -74), isLand(40.71, 286))
})
