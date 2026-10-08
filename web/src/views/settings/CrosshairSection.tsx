'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import Slider from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { toast } from '@/components/ui/Toast'
import type {
	CrosshairConfig,
	CrosshairPreset,
	CrosshairStroke,
	DesktopCrosshairApi,
} from '@/types/electron'
import { Section } from '@/views/me/components/Section'
import { SettingRow } from '@/views/me/components/settings/SettingRow'

const PRESETS: CrosshairPreset[] = ['cross', 'dot', 'ring', 'custom']

const COLORS = [
	'#4ade80',
	'#22d3ee',
	'#facc15',
	'#fb7185',
	'#f8fafc',
	'#e879f9',
]

/// SVG-превью: та же математика, что layout_shapes в crosshair_win.rs.
/// Работает на любой платформе — видно, что получится на оверлее.
function CrosshairPreview({ config }: { config: CrosshairConfig }) {
	const t = config.thickness
	const half = t / 2
	const ink = config.color
	const frame = '#000000'

	const bars: Array<{ x: number; y: number; w: number; h: number }> = []
	const polylines: Array<{ points: Array<[number, number]> }> = []
	let ring: { r: number } | null = null
	if (config.preset === 'cross') {
		const len = config.size
		const gap = config.gap
		bars.push(
			{ x: -half, y: -gap - len, w: t, h: len },
			{ x: -half, y: gap, w: t, h: len },
			{ x: -gap - len, y: -half, w: len, h: t },
			{ x: gap, y: -half, w: len, h: t }
		)
		if (config.dot) {
			const side = Math.max(2, t)
			const d = side / 2
			bars.push({ x: -d, y: -d, w: side, h: side })
		}
	} else if (config.preset === 'dot') {
		const side = Math.max(2, config.size)
		const d = side / 2
		bars.push({ x: -d, y: -d, w: side, h: side })
	} else if (config.preset === 'ring') {
		ring = { r: config.size }
		if (config.dot) {
			const side = Math.max(2, t)
			const d = side / 2
			bars.push({ x: -d, y: -d, w: side, h: side })
		}
	} else {
		// custom: та же логика, что layout_shapes в crosshair_win.rs.
		for (const stroke of config.strokes ?? []) {
			const pts = stroke.points ?? []
			if (pts.length === 1) {
				const side = Math.max(2, t)
				const d = side / 2
				const [px, py] = pts[0]
				bars.push({ x: px - d, y: py - d, w: side, h: side })
			} else if (pts.length >= 2) {
				polylines.push({ points: pts })
			}
		}
	}

	return (
		<div className="flex items-center justify-center rounded-lg bg-black/70 p-2">
			<svg height={72} viewBox="-44 -44 88 88" width={72}>
				{bars.map(
					(bar, index) =>
						config.outline && (
							<rect
								fill={frame}
								height={bar.h + 2}
								key={`f-${index}`}
								width={bar.w + 2}
								x={bar.x - 1}
								y={bar.y - 1}
							/>
						)
				)}
				{bars.map((bar, index) => (
					<rect
						fill={ink}
						height={bar.h}
						key={`b-${index}`}
						width={bar.w}
						x={bar.x}
						y={bar.y}
					/>
				))}
				{ring && config.outline && (
					<circle
						cx={0}
						cy={0}
						fill="none"
						r={ring.r + 1}
						stroke={frame}
						strokeWidth={t + 2}
					/>
				)}
				{ring && (
					<circle
						cx={0}
						cy={0}
						fill="none"
						r={ring.r}
						stroke={ink}
						strokeWidth={t}
					/>
				)}
				{polylines.map((line, index) => (
					<polyline
						key={`p-${index}`}
						fill="none"
						points={line.points.map(([x, y]) => `${x},${y}`).join(' ')}
						stroke={config.outline ? frame : ink}
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={config.outline ? t + 2 : t}
					/>
				))}
				{config.outline &&
					polylines.map((line, index) => (
						<polyline
							key={`pi-${index}`}
							fill="none"
							points={line.points.map(([x, y]) => `${x},${y}`).join(' ')}
							stroke={ink}
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={t}
						/>
					))}
			</svg>
		</div>
	)
}

/// Ручной редактор: штрихи в координатах ±64 от центра.
/// Точки прореживаются (мин. дистанция 2px), чтобы конфиг не пух.
function CrosshairEditor({
	config,
	onStrokes,
}: {
	config: CrosshairConfig
	onStrokes: (strokes: CrosshairStroke[]) => void
}) {
	const t = useTranslations('settings.crosshair')
	const [draft, setDraft] = useState<Array<[number, number]> | null>(null)
	const ref = useRef<SVGSVGElement | null>(null)

	const toLocal = (clientX: number, clientY: number): [number, number] | null => {
		const el = ref.current
		if (!el) return null
		const rect = el.getBoundingClientRect()
		if (rect.width === 0) return null
		const clamp = (v: number) => Math.max(-64, Math.min(64, Math.round(v)))
		return [
			clamp(((clientX - rect.left) / rect.width) * 128 - 64),
			clamp(((clientY - rect.top) / rect.height) * 128 - 64),
		]
	}

	const dist2 = (a: [number, number], b: [number, number]) =>
		(a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2

	return (
		<div className="flex flex-col items-end gap-2">
			<svg
				className="cursor-crosshair touch-none rounded-lg bg-black/70"
				height={160}
				onPointerDown={(e) => {
					const pt = toLocal(e.clientX, e.clientY)
					if (!pt) return
					;(e.target as Element).setPointerCapture?.(e.pointerId)
					setDraft([pt])
				}}
				onPointerMove={(e) => {
					if (!draft) return
					const pt = toLocal(e.clientX, e.clientY)
					if (!pt) return
					const last = draft[draft.length - 1]
					if (dist2(last, pt) < 4) return
					setDraft([...draft, pt])
				}}
				onPointerUp={() => {
					if (draft && draft.length > 0) {
						onStrokes([...(config.strokes ?? []), { points: draft }])
					}
					setDraft(null)
				}}
				ref={ref}
				viewBox="-64 -64 128 128"
				width={160}
			>
				<line stroke="#ffffff" strokeOpacity={0.15} x1={-64} x2={64} y1={0} y2={0} />
				<line stroke="#ffffff" strokeOpacity={0.15} x1={0} x2={0} y1={-64} y2={64} />
				{(config.strokes ?? []).map((stroke, index) => (
					<polyline
						fill="none"
						key={`s-${index}`}
						points={(stroke.points ?? []).map(([x, y]) => `${x},${y}`).join(' ')}
						stroke={config.color}
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={config.thickness}
					/>
				))}
				{draft && draft.length > 0 && (
					<polyline
						fill="none"
						points={draft.map(([x, y]) => `${x},${y}`).join(' ')}
						stroke={config.color}
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={config.thickness}
					/>
				)}
			</svg>
			<div className="flex gap-2">
				<Button
					disabled={(config.strokes ?? []).length === 0}
					onClick={() => onStrokes((config.strokes ?? []).slice(0, -1))}
					size="sm"
					variant="ghost"
				>
					{t('draw_undo')}
				</Button>
				<Button
					disabled={(config.strokes ?? []).length === 0}
					onClick={() => onStrokes([])}
					size="sm"
					variant="ghost"
				>
					{t('draw_clear')}
				</Button>
			</div>
		</div>
	)
}

export default function CrosshairSection() {
	const t = useTranslations('settings.crosshair')

	const [api, setApi] = useState<DesktopCrosshairApi | null>(null)
	const [config, setConfig] = useState<CrosshairConfig | null>(null)
	const [visible, setVisible] = useState(false)
	const [busy, setBusy] = useState(false)
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		const bridge = window.stalhubDesktop?.crosshair
		if (!bridge) return
		setApi(bridge)
		// get() идёт на всех платформах: конфиг персистится везде,
		// показать оверлей можно только там, где supported.
		let mounted = true
		void bridge
			.get()
			.then((next) => {
				if (mounted) setConfig(next)
			})
			.catch((error) => {
				console.error('[crosshair] get failed', error)
				if (mounted) setConfig(null)
			})
		return () => {
			mounted = false
			if (timer.current) clearTimeout(timer.current)
		}
	}, [])

	if (!api) return null

	// Вне Windows оверлей показать нельзя, но конфиг крутится полностью
	// (превью, пресеты, слайдеры — set персистит на всех платформах).
	const canShow = api.supported

	const push = (next: CrosshairConfig) => {
		setConfig(next)
		if (timer.current) clearTimeout(timer.current)
		timer.current = setTimeout(() => {
			void api
				.set(next)
				.catch(() => toast.error(t('save_error')))
		}, 150)
	}

	const patch = (part: Partial<CrosshairConfig>) => {
		if (!config) return
		push({ ...config, ...part })
	}

	const handleToggle = (checked: boolean) => {
		if (!config || busy || !canShow) return
		setBusy(true)
		const next = { ...config, enabled: checked }
		setConfig(next)
		const done = () =>
			void api
				.set(next)
				.then(() => (checked ? api.show() : api.hide()))
				.then((ok) => {
					if (ok) setVisible(checked)
					else toast.error(t('toggle_error'))
				})
				.catch(() => toast.error(t('toggle_error')))
				.finally(() => setBusy(false))
		done()
	}

	return (
		<Section icon="lucide:crosshair" title={t('title')}>
			<div className="flex flex-col gap-2">
				<SettingRow
					description={canShow ? t('enable_desc') : t('windows_only')}
					title={t('enable')}
				>
					<Switch
						checked={config?.enabled ?? false}
						disabled={!config || busy || !canShow}
						onCheckedChange={handleToggle}
					/>
				</SettingRow>
				{config && (
					<>
						<SettingRow
							description={t('preset_desc')}
							title={t('preset')}
						>
							<div className="flex gap-2">
								{PRESETS.map((preset) => (
									<Button
										key={preset}
										onClick={() => patch({ preset })}
										size="sm"
										variant={
											config.preset === preset
												? 'bordered'
												: 'outline'
										}
									>
										{t(`preset_${preset}`)}
									</Button>
								))}
							</div>
						</SettingRow>
						{config.preset === 'custom' && (
							<SettingRow
								description={t('custom_desc')}
								title={t('custom')}
							>
								<CrosshairEditor
									config={config}
									onStrokes={(strokes) => patch({ strokes })}
								/>
							</SettingRow>
						)}
						{config.preset !== 'custom' && (
							<SettingRow
								description={t('size_desc')}
								title={`${t('size')}: ${config.size}`}
							>
							<div className="w-40">
								<Slider
									max={64}
									min={2}
									onValueChange={(v) =>
										patch({ size: Math.round(v) })
									}
									value={config.size}
								/>
							</div>
							</SettingRow>
						)}
						{config.preset === 'cross' && (
							<SettingRow
								description={t('gap_desc')}
								title={`${t('gap')}: ${config.gap}`}
							>
								<div className="w-40">
									<Slider
										max={32}
										min={0}
										onValueChange={(v) =>
											patch({ gap: Math.round(v) })
										}
										value={config.gap}
									/>
								</div>
							</SettingRow>
						)}
						<SettingRow
							description={t('thickness_desc')}
							title={`${t('thickness')}: ${config.thickness}`}
						>
							<div className="w-40">
								<Slider
									max={12}
									min={1}
									onValueChange={(v) =>
										patch({ thickness: Math.round(v) })
									}
									value={config.thickness}
								/>
							</div>
						</SettingRow>
						<SettingRow
							description={t('opacity_desc')}
							title={`${t('opacity')}: ${Math.round((config.opacity / 255) * 100)}%`}
						>
							<div className="w-40">
								<Slider
									max={255}
									min={32}
									onValueChange={(v) =>
										patch({ opacity: Math.round(v) })
									}
									value={config.opacity}
								/>
							</div>
						</SettingRow>
						<SettingRow description={t('color_desc')} title={t('color')}>
							<div className="flex items-center gap-3">
								<CrosshairPreview config={config} />
								<div className="flex items-center gap-2">
								{COLORS.map((color) => (
									<button
										aria-label={color}
										className={`h-7 w-7 cursor-pointer rounded-full ring-2 ring-offset-2 ring-offset-background transition-transform hover:scale-110 ${config.color.toLowerCase() === color ? 'ring-primary' : 'ring-transparent'}`}
										key={color}
										onClick={() => patch({ color })}
										style={{ backgroundColor: color }}
										type="button"
									/>
								))}
								<input
									className="h-7 w-10 cursor-pointer rounded"
									onChange={(e) => patch({ color: e.target.value })}
									type="color"
									value={config.color}
								/>
							</div>
						</div>
					</SettingRow>
						<SettingRow description={t('dot_desc')} title={t('dot')}>
							<Switch
								checked={config.dot}
								onCheckedChange={(checked) =>
									patch({ dot: checked })
								}
							/>
						</SettingRow>
						<SettingRow
							description={t('outline_desc')}
							title={t('outline')}
						>
							<Switch
								checked={config.outline}
								onCheckedChange={(checked) =>
									patch({ outline: checked })
								}
							/>
						</SettingRow>
						<div className="flex items-center gap-2">
							<Button
								disabled={!config.enabled || busy || !canShow}
								onClick={() => {
									setBusy(true)
									void api
										.show()
										.then((ok) => {
											if (ok) setVisible(true)
											else toast.error(t('toggle_error'))
										})
										.catch(() => toast.error(t('toggle_error')))
										.finally(() => setBusy(false))
								}}
								size="sm"
								variant={visible ? 'bordered' : 'outline'}
							>
								{t(visible ? 'shown' : 'show')}
							</Button>
							<Button
								disabled={!visible || busy || !canShow}
								onClick={() => {
									setBusy(true)
									void api
										.hide()
										.then((ok) => {
											if (ok) setVisible(false)
											else toast.error(t('toggle_error'))
										})
										.catch(() => toast.error(t('toggle_error')))
										.finally(() => setBusy(false))
								}}
								size="sm"
								variant="ghost"
							>
								{t('hide')}
							</Button>
						</div>
					</>
				)}
			</div>
		</Section>
	)
}
