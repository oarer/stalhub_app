'use client'

import { Html, Line, OrbitControls, useCursor } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { Component, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type {
	BlockerPing,
	BlockerPool,
	BlockerRegion,
} from '@/types/server-blocker.type'
import type { Vec3 } from '@/views/server-blocker/geo'
import {
	latLngToVec3,
	shortestDelta,
	vec3ToLatLng,
	yawForLng,
} from '@/views/server-blocker/geo'
import { isLand } from '@/views/server-blocker/landmask'
import { poolCoords } from '@/views/server-blocker/server-blocker.const'

interface GlobeColors {
	land: string
	water: string
	sphere: string
	hub: string
	arc: string
	success: string
	warning: string
	danger: string
}

const FALLBACK_COLORS: GlobeColors = {
	land: '#b8e6fe',
	water: '#52525b',
	sphere: '#09090b',
	hub: '#ffffff',
	arc: '#10b981',
	success: '#10b981',
	warning: '#f59e0b',
	danger: '#f43f5e',
}

/** Токены темы бывают в lab()/oklch() — three.js их не парсит, поэтому
 * растеризуем цвет в 1×1 canvas и считываем готовые sRGB-байты. */
function cssColor(name: string, fallback: string): string {
	if (typeof document === 'undefined') return fallback
	const probe = document.createElement('span')
	probe.style.display = 'none'
	probe.style.color = `var(${name})`
	document.body.appendChild(probe)
	const resolved = getComputedStyle(probe).color.trim()
	probe.remove()
	if (!resolved) return fallback
	const canvas = document.createElement('canvas')
	canvas.width = 1
	canvas.height = 1
	const ctx = canvas.getContext('2d', { willReadFrequently: true })
	if (!ctx) return fallback
	ctx.clearRect(0, 0, 1, 1)
	ctx.fillStyle = resolved
	ctx.fillRect(0, 0, 1, 1)
	const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
	return `rgb(${r}, ${g}, ${b})`
}

function resolveGlobeColors(): GlobeColors {
	return {
		land: cssColor('--primary', FALLBACK_COLORS.land),
		water: cssColor('--muted-foreground', FALLBACK_COLORS.water),
		sphere: cssColor('--background', FALLBACK_COLORS.sphere),
		hub: cssColor('--foreground', FALLBACK_COLORS.hub),
		arc: cssColor('--success', FALLBACK_COLORS.arc),
		success: cssColor('--success', FALLBACK_COLORS.success),
		warning: cssColor('--warning', FALLBACK_COLORS.warning),
		danger: cssColor('--destructive', FALLBACK_COLORS.danger),
	}
}

/** Цвета глобуса из токенов; пересчитываются при смене темы/кастомных тем. */
function useGlobeColors(): GlobeColors {
	const [colors, setColors] = useState<GlobeColors>(resolveGlobeColors)
	useEffect(() => {
		const update = () => setColors(resolveGlobeColors())
		update()
		const observer = new MutationObserver(update)
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class', 'style'],
		})
		return () => observer.disconnect()
	}, [])
	return colors
}

function Rotator({
	targetYaw,
	paused,
	children,
}: {
	targetYaw: number
	paused: boolean
	children: ReactNode
}) {
	const ref = useRef<THREE.Group>(null)
	useEffect(() => {
		const g = ref.current
		if (!g) return
		g.rotation.y += shortestDelta(g.rotation.y, targetYaw)
	}, [targetYaw])
	useFrame((_, delta) => {
		const g = ref.current
		if (!g || paused) return
		g.rotation.y += delta * 0.05
	})
	return <group ref={ref}>{children}</group>
}

export interface Dots {
	landPos: Float32Array
	landCol: Float32Array
	waterPos: Float32Array
}

export function buildDots(landColor = FALLBACK_COLORS.land): Dots {
	const N = 20000
	const landPos: number[] = []
	const landCol: number[] = []
	const waterPos: number[] = []
	const golden = Math.PI * (3 - Math.sqrt(5))
	const col = new THREE.Color()
	for (let k = 0; k < N; k++) {
		const y = 1 - (k / (N - 1)) * 2
		const rr = Math.sqrt(Math.max(0, 1 - y * y))
		const th = golden * k
		const x = Math.cos(th) * rr
		const z = Math.sin(th) * rr

		const [lat, lng] = vec3ToLatLng(x, y, z)
		if (isLand(lat, lng)) {
			landPos.push(x, y, z)
			col.set(landColor).offsetHSL(0, 0, (Math.random() - 0.5) * 0.09)
			landCol.push(col.r, col.g, col.b)
		} else {
			waterPos.push(x * 0.995, y * 0.995, z * 0.995)
		}
	}
	return {
		landPos: new Float32Array(landPos),
		landCol: new Float32Array(landCol),
		waterPos: new Float32Array(waterPos),
	}
}

function DotSphere({ colors }: { colors: GlobeColors }) {
	const dots = useMemo(() => buildDots(colors.land), [colors.land])
	return (
		<group>
			<mesh>
				<sphereGeometry args={[0.99, 64, 64]} />
				<meshBasicMaterial
					color={colors.sphere}
					opacity={0.28}
					transparent
				/>
			</mesh>
			<points>
				<bufferGeometry>
					<bufferAttribute
						args={[dots.waterPos, 3]}
						attach="attributes-position"
					/>
				</bufferGeometry>
				<pointsMaterial
					color={colors.water}
					depthWrite={false}
					opacity={0.5}
					size={0.011}
					sizeAttenuation
					transparent
				/>
			</points>
			<points>
				<bufferGeometry>
					<bufferAttribute
						args={[dots.landPos, 3]}
						attach="attributes-position"
					/>
					<bufferAttribute
						args={[dots.landCol, 3]}
						attach="attributes-color"
					/>
				</bufferGeometry>
				<pointsMaterial
					depthWrite={false}
					size={0.02}
					sizeAttenuation
					vertexColors
				/>
			</points>
		</group>
	)
}

function PoolMarker({
	pool,
	pos,
	ping,
	allowedCount,
	colors,
	onToggle,
}: {
	pool: BlockerPool
	pos: Vec3
	ping: number | null
	allowedCount: number
	colors: GlobeColors
	onToggle: () => void
}) {
	const [hovered, setHovered] = useState(false)
	useCursor(hovered)
	const color =
		allowedCount === 0
			? colors.danger
			: allowedCount < pool.tunnels.length
				? colors.warning
				: colors.success
	return (
		<group position={pos}>
			<mesh>
				<sphereGeometry args={[0.02, 12, 12]} />
				<meshBasicMaterial color={color} />
			</mesh>
			<mesh
				onClick={(e) => {
					e.stopPropagation()
					onToggle()
				}}
				onPointerOut={() => setHovered(false)}
				onPointerOver={(e) => {
					e.stopPropagation()
					setHovered(true)
				}}
			>
				<sphereGeometry args={[0.055, 8, 8]} />
				<meshBasicMaterial depthWrite={false} opacity={0} transparent />
			</mesh>
			{hovered && (
				<Html
					center
					distanceFactor={5}
					style={{ pointerEvents: 'none' }}
					zIndexRange={[30, 0]}
				>
					<div className="whitespace-nowrap rounded border border-border bg-popover/90 px-1.5 py-0.5 text-popover-foreground shadow-xl backdrop-blur">
						<p className="font-mono text-[9px] leading-tight">
							<span className="font-bold">{pool.name}</span>
							<span className="text-muted-foreground">
								{' '}
								· {ping != null ? `${ping} ms` : '—'} ·{' '}
								{allowedCount}/{pool.tunnels.length}
							</span>
						</p>
					</div>
				</Html>
			)}
		</group>
	)
}

function HubArcs({
	hub,
	targets,
	color,
}: {
	hub: Vec3
	targets: Vec3[]
	color: string
}) {
	const lines = useMemo(
		() =>
			targets.map((t) => {
				const h = new THREE.Vector3(...hub)
				const p = new THREE.Vector3(...t)
				const mid = h
					.clone()
					.add(p)
					.multiplyScalar(0.5)
					.normalize()
					.multiplyScalar(1 + h.distanceTo(p) * 0.22)
				return new THREE.QuadraticBezierCurve3(
					h.clone(),
					mid,
					p.clone()
				)
					.getPoints(40)
					.map((v) => [v.x, v.y, v.z] as [number, number, number])
			}),
		[hub, targets]
	)
	return (
		<group>
			{lines.map((pts, i) => (
				<Line
					color={color}
					key={i}
					lineWidth={1.2}
					opacity={0.45}
					points={pts}
					transparent
				/>
			))}
		</group>
	)
}

function Scene({
	region,
	pools,
	pingByAddress,
	allowed,
	dragging,
	onTogglePool,
	onDrag,
}: {
	region: BlockerRegion
	pools: BlockerPool[]
	pingByAddress: Map<string, BlockerPing>
	allowed: Set<string>
	dragging: boolean
	onTogglePool: (pool: BlockerPool) => void
	onDrag: (dragging: boolean) => void
}) {
	const colors = useGlobeColors()
	const hubLatLng = useMemo<[number, number]>(() => {
		if (pools.length === 0) return [30, 40]
		let lat = 0
		let lng = 0
		pools.forEach((p) => {
			const [la, ln] = poolCoords(p.name, 0, region, true)
			lat += la
			lng += ln
		})
		return [lat / pools.length, lng / pools.length]
	}, [pools, region])
	const hub = useMemo(
		() => latLngToVec3(hubLatLng[0], hubLatLng[1], 1.002),
		[hubLatLng]
	)
	const targetYaw = useMemo(() => yawForLng(hubLatLng[1]), [hubLatLng])

	const markers = useMemo(
		() =>
			pools.map((pool) => {
				const [lat, lng] = poolCoords(pool.name, 0, region, true)
				let best: number | null = null
				for (const t of pool.tunnels) {
					const v = pingByAddress.get(t.address)?.avgMs
					if (v != null && (best == null || v < best)) best = v
				}
				const allowedCount = pool.tunnels.filter((t) =>
					allowed.has(t.address)
				).length
				return {
					pool,
					best,
					allowedCount,
					pos: latLngToVec3(lat, lng, 1.005),
				}
			}),
		[pools, region, pingByAddress, allowed]
	)
	const arcTargets = useMemo(
		() => markers.filter((m) => m.allowedCount > 0).map((m) => m.pos),
		[markers]
	)

	return (
		<>
			<OrbitControls
				enablePan={false}
				enableZoom={false}
				onEnd={() => onDrag(false)}
				onStart={() => onDrag(true)}
				rotateSpeed={0.6}
			/>
			<Rotator paused={dragging} targetYaw={targetYaw}>
				<DotSphere colors={colors} />
				<HubArcs color={colors.arc} hub={hub} targets={arcTargets} />

				<mesh position={hub}>
					<meshBasicMaterial color={colors.hub} />
				</mesh>
				{markers.map((m) => (
					<PoolMarker
						allowedCount={m.allowedCount}
						colors={colors}
						key={m.pool.name}
						onToggle={() => onTogglePool(m.pool)}
						ping={m.best}
						pool={m.pool}
						pos={m.pos}
					/>
				))}
			</Rotator>
		</>
	)
}

class GlobeErrorBoundary extends Component<{ children: ReactNode }> {
	state = { failed: false }

	static getDerivedStateFromError() {
		return { failed: true }
	}

	render() {
		if (this.state.failed) {
			return (
				<div className="flex h-80 w-full items-center justify-center rounded-xl bg-card/40 text-muted-foreground text-sm">
					{this.props.children}
				</div>
			)
		}
		return this.props.children
	}
}

export default function ServerBlockerGlobe({
	region,
	pools,
	pingByAddress,
	allowed,
	onTogglePool,
}: {
	region: BlockerRegion
	pools: BlockerPool[]
	pingByAddress: Map<string, BlockerPing>
	allowed: Set<string>
	onTogglePool: (pool: BlockerPool) => void
}) {
	const t = useTranslations()
	const [dragging, setDragging] = useState(false)
	return (
		<GlobeErrorBoundary>
			<div
				className="relative w-full overflow-hidden rounded-xl"
				style={{
					height: 340,
					background:
						'radial-gradient(ellipse 70% 90% at 50% 45%, color-mix(in srgb, var(--primary) 8%, transparent), transparent 70%), var(--background)',
				}}
			>
				<Canvas
					camera={{ fov: 40, position: [0, 0, 3.55] }}
					dpr={[1, 2]}
					gl={{ alpha: true, antialias: true }}
				>
					<Scene
						allowed={allowed}
						dragging={dragging}
						onDrag={setDragging}
						onTogglePool={onTogglePool}
						pingByAddress={pingByAddress}
						pools={pools}
						region={region}
					/>
				</Canvas>
				<div className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-muted-foreground">
					{dragging
						? t('serverBlocker.globe.drag')
						: t('serverBlocker.globe.hint')}
				</div>
			</div>
		</GlobeErrorBoundary>
	)
}
