'use client'

import { Icon } from '@iconify/react'
import { useTranslations } from 'next-intl'
import { type PointerEvent, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import {
	type Point,
	type RegionKey,
	type Regions,
	type Selection,
	selectionRect,
} from './trading'
import type { TradingCapture } from './useTradingCapture'

const REGION_KEYS: RegionKey[] = ['items', 'player', 'status']
const BORDER_COLORS: Record<RegionKey, string> = {
	items: '#22c55e',
	player: '#38bdf8',
	status: '#f59e0b',
}

type PanState = { x: number; y: number; left: number; top: number }

export function RegionCard({
	capture,
	regions,
	target,
	onTargetChange,
	region,
	onRegionChange,
	panMode,
	onPanModeChange,
	zoom,
	onZoomChange,
	running,
}: {
	capture: TradingCapture
	regions: Regions
	target: RegionKey
	onTargetChange: (key: RegionKey) => void
	region: Selection | null
	onRegionChange: (value: Selection | null) => void
	panMode: boolean
	onPanModeChange: (value: boolean) => void
	zoom: number
	onZoomChange: (value: number) => void
	running: boolean
}) {
	const t = useTranslations('trading')
	const viewport = useRef<HTMLDivElement>(null)
	const pan = useRef<PanState | null>(null)
	const drag = useRef<Point | null>(null)

	useEffect(() => {
		const element = viewport.current
		if (!element) return
		const onWheel = (event: WheelEvent) => {
			if (event.ctrlKey) {
				event.preventDefault()
				onZoomChange(
					Math.max(
						100,
						Math.min(400, zoom + (event.deltaY < 0 ? 25 : -25))
					)
				)
				return
			}
			const canScrollX = element.scrollWidth > element.clientWidth
			const canScrollY = element.scrollHeight > element.clientHeight
			if (!canScrollX && !canScrollY) return
			event.preventDefault()
			const line =
				event.deltaMode === 1
					? 16
					: event.deltaMode === 2
						? element.clientHeight
						: 1
			let deltaX = event.deltaX * line
			let deltaY = event.deltaY * line
			if (event.shiftKey) {
				const swap = deltaX
				deltaX = deltaY
				deltaY = swap
			}

			if (!canScrollY) {
				element.scrollLeft += deltaX + deltaY
				return
			}
			element.scrollLeft += deltaX
			element.scrollTop += deltaY
		}
		element.addEventListener('wheel', onWheel, { passive: false })
		return () => element.removeEventListener('wheel', onWheel)
	}, [onZoomChange, zoom])

	const point = (event: PointerEvent<HTMLDivElement>): Point => {
		const rect = event.currentTarget.getBoundingClientRect()
		return {
			x: (event.clientX - rect.left) / rect.width,
			y: (event.clientY - rect.top) / rect.height,
		}
	}

	const selectTarget = (key: RegionKey) => {
		drag.current = null
		onTargetChange(key)
		onPanModeChange(false)
	}

	return (
		<Card.Root className="min-w-0 gap-4">
			<Card.Title>
				<Icon className="text-primary" icon="lucide:scan" />
				{t('region')}
			</Card.Title>
			<div className="flex flex-wrap gap-2">
				{REGION_KEYS.map((key) => (
					<Button
						aria-pressed={target === key}
						className="gap-2"
						disabled={running}
						key={key}
						onClick={() => selectTarget(key)}
						variant={target === key ? 'primary' : 'secondary'}
					>
						{t(key)}
						{regions[key] && (
							<Icon
								className="text-green-500"
								icon="lucide:check"
							/>
						)}
					</Button>
				))}
				<Button
					aria-pressed={panMode}
					className="gap-2"
					onClick={() => onPanModeChange(!panMode)}
					variant={panMode ? 'primary' : 'secondary'}
				>
					<Icon icon="lucide:hand" />
					{t('pan')}
				</Button>
				<Button
					className="gap-2"
					disabled={!capture.connected || running}
					onClick={() =>
						capture.setPausePreview(!capture.pausePreview)
					}
					variant="secondary"
				>
					<Icon
						icon={
							capture.pausePreview
								? 'lucide:play'
								: 'lucide:pause'
						}
					/>
					{t(capture.pausePreview ? 'resumePreview' : 'pausePreview')}
				</Button>
				<Button
					className="gap-2"
					disabled={running || !region}
					onClick={() => onRegionChange(null)}
					variant="ghost"
				>
					<Icon icon="lucide:eraser" />
					{t('clearRegion')}
				</Button>
			</div>
			<div
				className="max-h-[60vh] overflow-auto overscroll-contain rounded-xl bg-black ring-2 ring-primary/25"
				data-testid="trading-viewport"
				ref={viewport}
			>
				<div
					aria-label={t('region')}
					className={`relative touch-none overflow-hidden rounded bg-black ${capture.connected ? 'cursor-crosshair' : 'min-h-48'}`}
					onPointerCancel={() => {
						drag.current = null
						pan.current = null
					}}
					onPointerDown={(event) => {
						if (panMode && viewport.current) {
							pan.current = {
								x: event.clientX,
								y: event.clientY,
								left: viewport.current.scrollLeft,
								top: viewport.current.scrollTop,
							}
							event.currentTarget.setPointerCapture(
								event.pointerId
							)
							return
						}
						if (!capture.connected || running || event.button !== 0)
							return
						event.currentTarget.setPointerCapture(event.pointerId)
						drag.current = point(event)
						onRegionChange(
							selectionRect(drag.current, drag.current)
						)
					}}
					onPointerMove={(event) => {
						if (pan.current && viewport.current) {
							viewport.current.scrollLeft =
								pan.current.left -
								(event.clientX - pan.current.x)
							viewport.current.scrollTop =
								pan.current.top -
								(event.clientY - pan.current.y)
							return
						}
						if (drag.current)
							onRegionChange(
								selectionRect(drag.current, point(event))
							)
					}}
					onPointerUp={(event) => {
						pan.current = null
						if (drag.current)
							onRegionChange(
								selectionRect(drag.current, point(event))
							)
						drag.current = null
					}}
					style={{ width: `${zoom}%` }}
				>
					<video
						aria-label={t('source')}
						className="block h-auto w-full"
						muted
						playsInline
						ref={capture.videoRef}
					/>
					{capture.connected &&
						(
							Object.entries(regions) as [
								RegionKey,
								Selection | null,
							][]
						).map(
							([key, value]) =>
								value && (
									<div
										className="pointer-events-none absolute border-2"
										key={key}
										style={{
											borderColor: BORDER_COLORS[key],
											left: `${value.x * 100}%`,
											top: `${value.y * 100}%`,
											width: `${value.width * 100}%`,
											height: `${value.height * 100}%`,
										}}
									>
										<span className="bg-black/80 text-white text-xs">
											{t(key)}
										</span>
									</div>
								)
						)}
				</div>
			</div>
		</Card.Root>
	)
}
