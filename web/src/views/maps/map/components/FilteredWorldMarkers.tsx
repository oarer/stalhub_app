'use client'

import L from 'leaflet'
import { useEffect } from 'react'
import { useMap } from 'react-leaflet'


export type SourceMarker = { i?: number; x?: number; z?: number; n?: string; o?: string; g?: string }
export default function FilteredWorldMarkers({ markers }: { markers: SourceMarker[] }) {
	const map = useMap()

	useEffect(() => {
		const layer = L.layerGroup()
		for (const marker of markers) {
			if (typeof marker.x !== 'number' || typeof marker.z !== 'number') continue
			// This export already uses map-image pixels; applying the world offset would shift it.
			const [px, py] = [marker.x, marker.z]
			const point = map.unproject([px, py], map.getMaxZoom())
			L.circleMarker(point, {
				radius: 3,
				color: '#f97316',
				fillColor: '#fb923c',
				fillOpacity: 0.8,
				weight: 1,
				interactive: false,
			}).addTo(layer)
		}
		layer.addTo(map)
		return () => { layer.remove() }
	}, [map, markers])

	return null
}