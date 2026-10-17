import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
	latLngToVec3,
	rotateY,
	shortestDelta,
	vec3ToLatLng,
	yawForLng,
} from './geo'
import { isLand } from './landmask'
import { poolCoords } from './server-blocker.const'

function lngDiff(a: number, b: number): number {
	let d = Math.abs(a - b) % 360
	if (d > 180) d = 360 - d
	return d
}

// Прямое + обратное преобразование совпадают на плотной сетке.
test('lat/lng roundtrips through vec3 on a dense grid', () => {
	for (let lat = -85; lat <= 85; lat += 5) {
		for (let lng = -180; lng < 180; lng += 5) {
			const [x, y, z] = latLngToVec3(lat, lng, 1)
			const [la2, ln2] = vec3ToLatLng(x, y, z)
			assert.ok(
				Math.abs(la2 - lat) < 1e-9,
				`lat roundtrip failed for (${lat}, ${lng}): got ${la2}`
			)
			assert.ok(
				lngDiff(ln2, lng) < 1e-9,
				`lng roundtrip failed for (${lat}, ${lng}): got ${ln2}`
			)
		}
	}
})

// Доворот кладёт хаб ровно перед камерой (+Z).
test('yawForLng faces the hub to the camera', () => {
	const hubs: Array<[number, number]> = [
		[52.5, 53.6], // RU
		[50, 15], // EU
		[39, -98], // NA
		[37, 133], // NEA
		[-10, 130], // SEA
		[55.75, 37.61], // Moscow
		[40.71, -74], // NYC
		[-33.87, 151.21], // Sydney
	]
	for (const [lat, lng] of hubs) {
		const v = latLngToVec3(lat, lng, 1)
		const [x, y, z] = rotateY(v, yawForLng(lng))
		assert.ok(
			Math.abs(x) < 1e-9,
			`hub (${lat}, ${lng}) not centered: x=${x}`
		)
		assert.ok(z > 0, `hub (${lat}, ${lng}) behind camera: z=${z}`)
		// Доворот не меняет широту: радиус в плоскости XZ и высота те же.
		const s = Math.sin((90 - lat) * (Math.PI / 180))
		assert.ok(
			Math.abs(Math.sqrt(x * x + z * z) - s) < 1e-9,
			`hub (${lat}, ${lng}) latitude changed`
		)
		assert.ok(
			Math.abs(y - Math.cos((90 - lat) * (Math.PI / 180))) < 1e-12,
			`hub (${lat}, ${lng}) height changed`
		)
	}
})

test('shortestDelta picks the short way around', () => {
	assert.ok(Math.abs(shortestDelta(0, Math.PI) - Math.PI) < 1e-12)
	assert.ok(Math.abs(shortestDelta(0, 3 * Math.PI) - Math.PI) < 1e-12)
	assert.ok(Math.abs(shortestDelta(1, 1 + 0.2) - 0.2) < 1e-12)
	assert.ok(Math.abs(shortestDelta(0, -0.2) + 0.2) < 1e-12)
})

// Каждый пул серверов стоит на суше (с допуском 1.5° на береговые клетки
// растра 1°): иначе маркеры снова окажутся не на тех континентах.
test('every server pool marker is on (or next to) land', () => {
	const regions = ['RU', 'EU', 'NA', 'NEA', 'SEA'] as const
	const nearLand = (lat: number, lng: number): boolean => {
		for (const dLat of [-1.5, 0, 1.5]) {
			for (const dLng of [-1.5, 0, 1.5]) {
				if (isLand(lat + dLat, lng + dLng)) return true
			}
		}
		return false
	}
	// Имена пулов — с реальных address_list (см. server-blocker.const.ts).
	const poolsByRegion: Record<string, string[]> = {
		RU: [
			'CLOUD-RU-7',
			'MSK1',
			'MSK2',
			'MSK2X',
			'SPB3',
			'NSK1',
			'TAS',
			'SE',
			'EKB',
			'SMR',
			'RST',
			'KRY',
			'KHB',
			'AST',
		],
		EU: ['FRA', 'MSK2X', 'KYI', 'WAW', 'MAD', 'SOF'],
		NA: [
			'DAL',
			'NYC',
			'LAX',
			'MIA',
			'CHI',
			'ASH',
			'ATL',
			'DEN',
			'SEA',
			'TOR',
			'SAN',
			'LIM',
		],
		NEA: ['TYO', 'KOR'],
		SEA: ['SGP', 'SYD'],
	}
	for (const region of regions) {
		for (const name of poolsByRegion[region]) {
			const [lat, lng] = poolCoords(name, 0, region)
			assert.ok(
				nearLand(lat, lng),
				`pool ${name} (${lat}, ${lng}) is in the ocean`
			)
		}
	}
})

// raw=true отдаёт базовые координаты без джиттера — маркеры глобуса
// стоят точно, а не со сдвигом до ~2.6° вверх-вправо.
test('poolCoords raw flag returns base coordinates', () => {
	for (const index of [0, 1, 3, 7]) {
		assert.deepEqual(poolCoords('MSK1', index, 'RU', true), [55.86, 37.61])
	}
	assert.deepEqual(
		poolCoords('MSK1', 0, 'RU', true),
		poolCoords('MSK1', 0, 'RU')
	)
})
