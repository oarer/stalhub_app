import { Marker } from 'react-leaflet'

import type { MapMarker } from '../types'
import { MARKER_PRESETS } from '../types'
import { makeMarkerIcon } from '../utils'

interface MarkerLayerProps {
	markers: MapMarker[]
	onRemove: (id: string) => void
}

export function MarkerLayer({ markers, onRemove }: MarkerLayerProps) {
	return (
		<>
			{markers.map((m) => {
				const preset = MARKER_PRESETS.find((p) => p.key === m.preset)
				if (!preset) {
					return null
				}
				const icon = makeMarkerIcon(preset)
				return (
					<Marker
						eventHandlers={{
							contextmenu: () => onRemove(m.id),
						}}
						icon={icon}
						key={m.id}
						position={[m.position.lat, m.position.lng]}
					/>
				)
			})}
		</>
	)
}
