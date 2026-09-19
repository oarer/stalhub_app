'use client'

import { Icon } from '@iconify/react'
import { useLocale, useTranslations } from 'next-intl'
import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { unbounded } from '@/app/fonts'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CheckBox } from '@/components/ui/CheckBox'
import Input from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import Slider from '@/components/ui/Slider'
import type { Locale } from '@/types/item.type'
import { TradePrices } from './TradePrices'
import {
	createMatcher,
	itemCatalogId,
	type Point,
	parseTradingText,
	type Selection,
	selectionRect,
} from './trading'
import { useTradingCapture } from './useTradingCapture'
import { useTradingCatalog } from './useTradingCatalog'

const FULL: Selection = { x: 0, y: 0, width: 1, height: 1 }
const LANGUAGES = {
	ru: 'rus+eng',
	en: 'eng',
	fr: 'fra+eng',
	es: 'spa+eng',
	ko: 'kor+eng',
}

export function TradingView() {
	const t = useTranslations('trading')
	const locale = useLocale() as Locale
	const [language, setLanguage] = useState<Locale>(
		locale in LANGUAGES ? locale : 'ru'
	)
	const [regions, setRegions] = useState<
		Record<'items' | 'player' | 'amount', Selection | null>
	>({ items: null, player: null, amount: null })
	const [target, setTarget] = useState<'items' | 'player' | 'amount'>('items')
	const region = regions[target]
	const setRegion = (value: Selection | null) =>
		setRegions((previous) => ({ ...previous, [target]: value }))
	const [panMode, setPanMode] = useState(false)
	const viewport = useRef<HTMLDivElement>(null)
	const pan = useRef<{
		x: number
		y: number
		left: number
		top: number
	} | null>(null)
	const [upscale, setUpscale] = useState(true)
	const [debug, setDebug] = useState(false)
	const [zoom, setZoom] = useState(100)
	const [copyState, setCopyState] = useState<'copy' | 'copied' | 'copyError'>(
		'copy'
	)
	const drag = useRef<Point | null>(null)
	const capture = useTradingCapture()
	const { items, loading, error } = useTradingCatalog()
	const catalog = useMemo(
		() =>
			(items ?? []).flatMap((item) => {
				const name = item.name?.[language]
				const id = itemCatalogId(item.data)
				return name && id ? [{ name, id }] : []
			}),
		[items, language]
	)
	const match = useMemo(() => createMatcher(catalog), [catalog])
	const rows = useMemo(
		() => parseTradingText(capture.text).map(match),
		[capture.text, match]
	)
	const json = JSON.stringify(rows, null, 2)
	const running = capture.status !== 'idle'

	useEffect(() => {
		const element = viewport.current
		if (!element) return
		const onWheel = (event: WheelEvent) => {
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
			// A zoomed preview usually overflows horizontally only; feed the
			// vertical wheel into horizontal panning so the wheel always moves it.
			if (!canScrollY) {
				element.scrollLeft += deltaX + deltaY
				return
			}
			element.scrollLeft += deltaX
			element.scrollTop += deltaY
		}
		element.addEventListener('wheel', onWheel, { passive: false })
		return () => element.removeEventListener('wheel', onWheel)
	}, [])

	const point = (event: PointerEvent<HTMLDivElement>): Point => {
		const rect = event.currentTarget.getBoundingClientRect()
		return {
			x: (event.clientX - rect.left) / rect.width,
			y: (event.clientY - rect.top) / rect.height,
		}
	}
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(json)
			setCopyState('copied')
		} catch {
			setCopyState('copyError')
		}
	}

	return (
		<section className="flex w-ful flex-col gap-6 px-4 pt-24 pb-12">
			<h1
				className={`${unbounded.className} font-semibold text-2xl tracking-tight md:text-3xl xl:text-4xl`}
			>
				{t('title')}
			</h1>

			<Card.Root>
				<Card.Content className="flex flex-col gap-2">
					<div className="flex flex-wrap items-center gap-2">
						<Button
							className="gap-2"
							disabled={capture.selecting || running}
							onClick={() => {
								setRegions({
									items: null,
									player: null,
									amount: null,
								})
								setZoom(100)
								void capture.selectSource()
							}}
							variant="primary"
						>
							<Icon
								className="text-lg"
								icon="lucide:monitor-up"
							/>
							{t('source')}
						</Button>
						<Button
							className="gap-2"
							disabled={
								!capture.connected ||
								!regions.items ||
								Object.values(regions).some(
									(value) =>
										value &&
										(value.width < 0.005 ||
											value.height < 0.005)
								) ||
								running
							}
							onClick={() => {
								if (regions.items)
									void capture.start(
										regions.items,
										LANGUAGES[language],
										upscale,
										{
											player: regions.player,
											amount: regions.amount,
										}
									)
								if (
									typeof Notification !== 'undefined' &&
									Notification.permission === 'default'
								) {
									void Notification.requestPermission().catch(
										() => {
											/* Denied or unavailable (e.g. Wayland). */
										}
									)
								}
							}}
							variant="bordered"
						>
							<Icon className="text-lg" icon="lucide:play" />
							{t('start')}
						</Button>
						<Button
							className="gap-2"
							disabled={!running}
							onClick={capture.stop}
							variant="secondary"
						>
							<Icon className="text-lg" icon="lucide:square" />
							{t('stop')}
						</Button>
						<Button
							className="gap-2"
							disabled={!capture.connected && !capture.selecting}
							onClick={capture.disconnect}
							variant="ghost"
						>
							<Icon className="text-lg" icon="lucide:unplug" />
							{t('disconnect')}
						</Button>
						<label className="ml-auto flex flex-col gap-1 text-right text-sm">
							<span className="text-muted-foreground text-xs">
								{t('language')}
							</span>
							<select
								className="cursor-pointer rounded-lg border-2 border-muted bg-card px-3 py-1.5 font-semibold text-foreground outline-none transition-colors duration-500 disabled:cursor-not-allowed disabled:opacity-50"
								disabled={running}
								onChange={(e) =>
									setLanguage(e.target.value as Locale)
								}
								value={language}
							>
								<option value="ru">Русский + English</option>
								<option value="en">English</option>
								<option value="fr">Français + English</option>
								<option value="es">Español + English</option>
								<option value="ko">한국어 + English</option>
							</select>
						</label>
					</div>

					<CheckBox
						checked={upscale}
						disabled={running}
						label={t('upscale')}
						onCheckedChange={setUpscale}
					/>

					<p
						className="font-semibold text-muted-foreground text-sm"
						data-testid="trading-performance"
					>
						{t('performance', {
							ms: capture.duration ?? '—',
							skipped: capture.skipped,
						})}
					</p>

					<p aria-live="polite" className="text-sm" role="status">
						{t(
							running
								? capture.status
								: capture.connected
									? 'ready'
									: 'idle'
						)}
						{running
							? ` · ${capture.progress}% · #${capture.frame}`
							: ''}
					</p>

					{capture.error && (
						<p
							className="font-semibold text-destructive"
							role="alert"
						>
							{t(capture.error)}
						</p>
					)}

					<p className="text-muted-foreground text-sm">
						{t('privacy')}
					</p>
				</Card.Content>
			</Card.Root>

			<div className="grid gap-6 lg:grid-cols-2">
				<Card.Root className="min-w-0 gap-4">
					<Card.Title>
						<Icon className="text-primary" icon="lucide:scan" />
						{t('region')}
					</Card.Title>
					<div className="flex flex-wrap gap-2">
						{(['items', 'player', 'amount'] as const).map((key) => (
							<Button
								aria-pressed={target === key}
								disabled={running}
								key={key}
								onClick={() => {
									drag.current = null
									setTarget(key)
									setPanMode(false)
								}}
								variant={
									target === key ? 'primary' : 'secondary'
								}
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
							onClick={() => setPanMode((value) => !value)}
							variant={panMode ? 'primary' : 'secondary'}
						>
							<Icon icon="lucide:hand" />
							{t('pan')}
						</Button>
						<Button
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
							{t(
								capture.pausePreview
									? 'resumePreview'
									: 'pausePreview'
							)}
						</Button>
						<Button
							disabled={running || !region}
							onClick={() => setRegion(null)}
							variant="ghost"
						>
							<Icon icon="lucide:eraser" />
							{t('clearRegion')}
						</Button>
						<Button
							disabled={!capture.connected || running}
							onClick={() => setRegion(FULL)}
							variant="ghost"
						>
							<Icon icon="lucide:maximize" />
							{t('full')}
						</Button>
					</div>

					<div className="flex items-center gap-3">
						<span className="text-muted-foreground text-sm">
							{t('zoom')}: {zoom}%
						</span>
						<div className="flex-1" data-testid="trading-zoom">
							<Slider
								disabled={!capture.connected}
								max={400}
								min={100}
								onValueChange={(value) => {
									drag.current = null
									setZoom(value)
								}}
								step={25}
								value={zoom}
							/>
						</div>
					</div>
					<p className="text-muted-foreground text-xs">
						{t('zoomHint')}
					</p>

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
								if (
									!capture.connected ||
									running ||
									event.button !== 0
								)
									return
								event.currentTarget.setPointerCapture(
									event.pointerId
								)
								drag.current = point(event)
								setRegion(
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
									setRegion(
										selectionRect(
											drag.current,
											point(event)
										)
									)
							}}
							onPointerUp={(event) => {
								pan.current = null
								if (drag.current)
									setRegion(
										selectionRect(
											drag.current,
											point(event)
										)
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
										'items' | 'player' | 'amount',
										Selection | null,
									][]
								).map(
									([key, value]) =>
										value && (
											<div
												className="pointer-events-none absolute border-2"
												key={key}
												style={{
													borderColor: {
														items: '#22c55e',
														player: '#38bdf8',
														amount: '#f59e0b',
													}[key],
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

					<fieldset
						className="grid grid-cols-4 gap-2"
						disabled={!capture.connected || running}
					>
						<legend className="col-span-4 mb-2 text-muted-foreground text-xs">
							{t('percent')}
						</legend>
						{(['x', 'y', 'width', 'height'] as const).map((key) => (
							<Input
								key={key}
								label={`trading.${key}`}
								max={100}
								min={0}
								onChange={(event) => {
									const next = {
										...(region ?? FULL),
										[key]:
											Math.max(
												0,
												Math.min(
													100,
													Number(event.target.value)
												)
											) / 100,
									}
									next.width = Math.min(
										next.width,
										1 - next.x
									)
									next.height = Math.min(
										next.height,
										1 - next.y
									)
									setRegion(next)
								}}
								step={0.1}
								type="number"
								value={`${Math.round((region ?? FULL)[key] * 1000) / 10}`}
							/>
						))}
					</fieldset>
				</Card.Root>

				<Card.Root className="min-w-0 gap-4">
					<div className="flex items-center justify-between gap-2">
						<Card.Title>
							<Icon
								className="text-primary"
								icon="lucide:file-code-2"
							/>
							{t('result')}
						</Card.Title>
						<Button
							onClick={() => {
								void copy()
							}}
							variant="secondary"
						>
							<Icon icon="lucide:clipboard" />
							{t(copyState)}
						</Button>
					</div>
					<p className="text-muted-foreground text-sm">
						{t('snapshot')}
					</p>
					{loading && !items?.length && (
						<p
							className="flex items-center gap-2 font-semibold text-text-accent"
							role="status"
						>
							<Skeleton className="size-4" />
							{t('loadingCatalog')}
						</p>
					)}
					{(error || (!loading && !items?.length)) && (
						<p className="text-red-500" role="alert">
							{t('catalogError')}
						</p>
					)}
					{!rows.length && (
						<p className="text-muted-foreground text-sm">
							{t('empty')}
						</p>
					)}
					<pre
						className="max-h-96 overflow-auto rounded-xl bg-background p-4 text-xs"
						data-testid="trading-json"
					>
						{json}
					</pre>
					<details>
						<summary className="cursor-pointer text-sm">
							{t('raw')}
						</summary>
						<pre className="max-h-64 overflow-auto whitespace-pre-wrap p-2 text-xs">
							{capture.text}
						</pre>
					</details>
				</Card.Root>
			</div>

			<TradePrices
				amount={capture.amountText}
				items={items ?? []}
				player={capture.playerText}
				rows={rows}
			/>
		</section>
	)
}
