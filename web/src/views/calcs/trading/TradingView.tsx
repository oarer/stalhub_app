'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { unbounded } from '@/app/fonts'
import { toast } from '@/components/ui/Toast'
import type { TradeDealReason } from '@/stores/useTradingHistory.store'
import { useTradingHistoryStore } from '@/stores/useTradingHistory.store'
import { useTradingPricesStore } from '@/stores/useTradingPrices.store'
import type { Locale } from '@/types/item.type'
import { DebugCard } from './DebugCard'
import { tradePartialTotal, tradeTotal } from './pricing'
import { RegionCard } from './RegionCard'
import { TradeHistory } from './TradeHistory'
import { TradePrices } from './TradePrices'
import { TradingControls } from './TradingControls'
import {
	createMatcher,
	itemCatalogId,
	parseTradeStatus,
	parseTradingText,
	type RegionKey,
	type Regions,
	type Selection,
	type TradingOverlayState,
} from './trading'
import { useTradingCapture } from './useTradingCapture'
import { useTradingCatalog } from './useTradingCatalog'


const LANGUAGES = {
	ru: 'rus+eng',
	en: 'eng',
	fr: 'fra+eng',
	es: 'spa+eng',
	ko: 'kor+eng',
}

const EMPTY_REGIONS: Regions = { items: null, player: null, status: null }

export function TradingView() {
	const t = useTranslations('trading')
	const locale = useLocale() as Locale
	const [language, setLanguage] = useState<Locale>(
		locale in LANGUAGES ? locale : 'ru'
	)
	const [regions, setRegions] = useState<Regions>(EMPTY_REGIONS)
	const [target, setTarget] = useState<RegionKey>('items')
	const region = regions[target]
	const setRegion = (value: Selection | null) =>
		setRegions((previous) => ({ ...previous, [target]: value }))
	const [panMode, setPanMode] = useState(false)
	const [upscale, setUpscale] = useState(true)
	const [debug, setDebug] = useState(false)
	const [zoom, setZoom] = useState(100)
	const [copyState, setCopyState] = useState<'copy' | 'copied' | 'copyError'>(
		'copy'
	)
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
	// Unrecognized OCR lines (id: null) have no price and pollute completed
	// deals, so they never reach the overlay or the trade history.
	const matchedItems = useMemo(
		() => rows.filter((row) => row.id !== null),
		[rows]
	)
	const json = JSON.stringify(rows, null, 2)
	const running = capture.status !== 'idle'

	const prices = useTradingPricesStore((s) => s.prices)
	const addDeal = useTradingHistoryStore((s) => s.addDeal)
	const [overlayCompleted, setOverlayCompleted] = useState<{
		at: number
		total: number | null
	} | null>(null)
	const finishedRef = useRef(false)
	const lastSentRef = useRef('')
	const completedItemsRef = useRef('')
	const sawEmptyItemsRef = useRef(false)

	const expected = tradeTotal(rows, prices)
	const partial = tradePartialTotal(rows, prices)
	const total = expected ?? partial

	const tradeStatus = parseTradeStatus(capture.statusText)

	const finalize = useCallback(
		(reason: TradeDealReason) => {
			if (finishedRef.current) return
			finishedRef.current = true
			completedItemsRef.current = JSON.stringify(matchedItems)
			sawEmptyItemsRef.current = false
			const completedAt = Date.now()
			setOverlayCompleted({ at: completedAt, total })
			addDeal({
				player: capture.playerText,
				items: matchedItems,
				total,
				completedAt,
				reason,
			})
			toast.success(
				t('dealCompleted', {
					player: capture.playerText.trim() || '—',
				})
			)
		},
		[addDeal, capture.playerText, matchedItems, t, total]
	)

	useEffect(() => {
		const overlay = window.stalhubDesktop?.tradingOverlay
		if (!overlay) return
		if (running) {
			finishedRef.current = false
			setOverlayCompleted(null)
			lastSentRef.current = ''
			void overlay.open()
		} else {
			lastSentRef.current = ''
			void overlay.close()
		}
	}, [running])

	const overlayState: TradingOverlayState = useMemo(
		() => ({
			running,
			player: capture.playerText,
			items: matchedItems,
			total,
			status: tradeStatus,
			completed: overlayCompleted !== null,
			completedAt: overlayCompleted?.at ?? null,
			completedTotal: overlayCompleted?.total ?? null,
		}),
		[
			capture.playerText,
			matchedItems,
			overlayCompleted,
			running,
			total,
			tradeStatus,
		]
	)

	useEffect(() => {
		const overlay = window.stalhubDesktop?.tradingOverlay
		if (!overlay || !running) return
		const serialized = JSON.stringify(overlayState)
		if (serialized === lastSentRef.current) return
		lastSentRef.current = serialized
		overlay.update(overlayState)
	}, [overlayState, running])

	useEffect(() => {
		if (!running || finishedRef.current || tradeStatus !== 'success') return
		finalize('success')
	}, [finalize, running, tradeStatus])

	// After a deal completes the tracker keeps OCR running. The next trade is
	// detected from the items OCR text: either a different items snapshot from
	// the completed trade's, or a new non-empty set after the trade list went
	// empty. Only then is the auto-complete armed again and the overlay
	// returns to an active trade. Gating on the items text also prevents a
	// manual completion on a non-success status from double-recording the
	// same trade and from leaving the tracker stuck on the completed screen.
	useEffect(() => {
		if (!running || !finishedRef.current) return
		const current = JSON.stringify(matchedItems)
		if (current === '[]') {
			sawEmptyItemsRef.current = true
			return
		}
		if (current === completedItemsRef.current && !sawEmptyItemsRef.current)
			return
		finishedRef.current = false
		sawEmptyItemsRef.current = false
		completedItemsRef.current = ''
		setOverlayCompleted(null)
	}, [matchedItems, running])

	useEffect(() => {
		const overlay = window.stalhubDesktop?.tradingOverlay
		if (!overlay) return
		return overlay.onComplete(() => {
			if (running && !finishedRef.current) finalize('manual')
		})
	}, [finalize, running])

	useEffect(
		() => () => {
			window.stalhubDesktop?.tradingOverlay?.close().catch(() => {
				/* Window may already be closed. */
			})
		},
		[]
	)

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

			<TradingControls
				capture={capture}
				debug={debug}
				language={language}
				onDebugChange={setDebug}
				onLanguageChange={setLanguage}
				onResetRegions={() => {
					setRegions(EMPTY_REGIONS)
					setZoom(100)
				}}
				onUpscaleChange={setUpscale}
				regions={regions}
				upscale={upscale}
			/>

			<div
				className={`grid gap-6 ${debug ? 'lg:grid-cols-2' : 'lg:grid-cols-1'}`}
			>
				<RegionCard
					capture={capture}
					onPanModeChange={setPanMode}
					onRegionChange={setRegion}
					onTargetChange={setTarget}
					onZoomChange={setZoom}
					panMode={panMode}
					region={region}
					regions={regions}
					running={running}
					target={target}
					zoom={zoom}
				/>

				{debug && (
					<DebugCard
						catalogError={error}
						copyState={copyState}
						items={items}
						json={json}
						loading={loading}
						onCopy={() => {
							void copy()
						}}
						raw={capture.text}
						rows={rows}
					/>
				)}
			</div>

			<TradePrices
				items={items ?? []}
				player={capture.playerText}
				rows={rows}
			/>

			<TradeHistory />
		</section>
	)
}
