import L from 'leaflet'
import { useEffect } from 'react'
import { useMap } from 'react-leaflet'

interface FitBoundsProps {
	fullMaxLevel: number
	imageWidth: number
	imageHeight: number
}

export function FitBounds({
	fullMaxLevel,
	imageWidth,
	imageHeight,
}: FitBoundsProps) {
	const map = useMap()
	useEffect(() => {
		const sw = map.unproject([0, imageHeight], fullMaxLevel)
		const ne = map.unproject([imageWidth, 0], fullMaxLevel)
		const bounds = L.latLngBounds(sw, ne)
		map.setMaxBounds(bounds.pad(0.1))
		map.fitBounds(bounds)
	}, [map, fullMaxLevel, imageWidth, imageHeight])
	return null
}
