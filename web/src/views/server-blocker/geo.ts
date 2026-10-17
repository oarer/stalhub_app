// Чистая гео-математика глобуса блокировщика серверов (без three.js,
// чтобы можно было покрыть unit-тестами). Соглашение общее для точек
// континентов, маркеров пулов и доворота камеры:
//   phi = (90 - lat), theta = (lng + 180)
//   x = -r·sinφ·cosθ, y = r·cosφ, z = r·sinφ·sinθ

export const D2R = Math.PI / 180

export type Vec3 = [number, number, number]

export function latLngToVec3(lat: number, lng: number, r: number): Vec3 {
	const phi = (90 - lat) * D2R
	const theta = (lng + 180) * D2R
	return [
		-r * Math.sin(phi) * Math.cos(theta),
		r * Math.cos(phi),
		r * Math.sin(phi) * Math.sin(theta),
	]
}

/** Обратное преобразование (для тестов): единичный вектор -> [lat, lng]. */
export function vec3ToLatLng(
	x: number,
	y: number,
	z: number
): [number, number] {
	const r = Math.sqrt(x * x + y * y + z * z) || 1
	const lat = Math.asin(Math.max(-1, Math.min(1, y / r))) / D2R
	let lng = (Math.atan2(z / r, -x / r) / D2R - 180) % 360
	if (lng < -180) lng += 360
	if (lng > 180) lng -= 360
	return [lat, lng]
}

/** Поворот группы вокруг Y (радианы), чтобы долгота хаба смотрела в камеру (+Z). */
export function yawForLng(hubLng: number): number {
	return (-90 - hubLng) * D2R
}

export function shortestDelta(from: number, to: number): number {
	const two = Math.PI * 2
	let d = (to - from) % two
	if (d > Math.PI) d -= two
	if (d < -Math.PI) d += two
	return d
}

/** Поворот вектора вокруг оси Y на угол a (та же конвенция, что у three.js). */
export function rotateY([x, y, z]: Vec3, a: number): Vec3 {
	const c = Math.cos(a)
	const s = Math.sin(a)
	return [x * c + z * s, y, -x * s + z * c]
}
