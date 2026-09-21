'use client'

import { Icon } from '@iconify/react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { montserrat } from '@/app/fonts'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/lib/date'
import type { MatchedRow, TradeStatus, TradingOverlayState } from './trading'

const STATUS_KEYS: Record<TradeStatus, string> = {
	idle: 'statusIdle',
	agreement: 'statusAgreement',
	success: 'statusSuccess',
	unknown: 'statusUnknown',
}

const STATUS_STYLES: Record<TradeStatus, string> = {
	idle: 'bg-muted text-muted-foreground',
	agreement: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
	success: 'bg-success/15 text-success ring-success/30',
	unknown: 'bg-muted text-muted-foreground',
}

const INITIAL: TradingOverlayState = {
	running: false,
	player: '',
	items: [],
	total: null,
	status: 'idle',
	completed: false,
	completedAt: null,
	completedTotal: null,
}

function sanitize(value: unknown): TradingOverlayState {
	if (!value || typeof value !== 'object') return INITIAL
	const state = value as Partial<TradingOverlayState>
	const rows = Array.isArray(state.items) ? state.items : []
	return {
		running: state.running === true,
		player: typeof state.player === 'string' ? state.player : '',
		items: rows.filter(
			(row): row is MatchedRow =>
				!!row &&
				typeof row.name === 'string' &&
				typeof row.count === 'number'
		),
		total: typeof state.total === 'number' ? state.total : null,
		status: ['idle', 'agreement', 'success', 'unknown'].includes(
			state.status as string
		)
			? (state.status as TradeStatus)
			: 'idle',
		completed: state.completed === true,
		completedAt:
			typeof state.completedAt === 'number' ? state.completedAt : null,
		completedTotal:
			typeof state.completedTotal === 'number'
				? state.completedTotal
				: null,
	}
}

export function TradingOverlay() {
	const t = useTranslations('trading')
	const locale = useLocale()
	const [state, setState] = useState<TradingOverlayState>(INITIAL)
	const [newTrade, setNewTrade] = useState(false)
	const prevCompleted = useRef(false)

	useEffect(() => {
		const overlay = window.stalhubDesktop?.tradingOverlay
		if (!overlay) return
		return overlay.onState((value) => {
			setState(sanitize(value))
		})
	}, [])

	// A completed deal is followed by the next one while OCR keeps running.
	// Flash a "new trade" badge when the tracked session resets so the user
	// knows the next trade was picked up automatically.
	useEffect(() => {
		const wasCompleted = prevCompleted.current
		prevCompleted.current = state.completed
		if (!wasCompleted || state.completed || !state.running) return
		setNewTrade(true)
		const timer = setTimeout(() => setNewTrade(false), 3000)
		return () => clearTimeout(timer)
	}, [state.completed, state.running])

	const format = (value: number | null) =>
		value === null ? '—' : value.toLocaleString(locale)

	const close = () => {
		window.stalhubDesktop?.tradingOverlay?.close().catch(() => {
			/* Window may already be gone. */
		})
	}
	const complete = () => {
		window.stalhubDesktop?.tradingOverlay?.complete()
	}

	const total = state.completed ? state.completedTotal : state.total

	return (
		<div
			className="flex h-screen select-none flex-col bg-background text-foreground"
			data-testid="trading-overlay"
		>
			<div className="flex shrink-0 items-center gap-2 border-primary/20 border-b bg-card/80 px-3 py-2 [-webkit-app-region:drag]">
				<Icon className="text-primary" icon="lucide:scan" />
				<span className="font-semibold text-sm">
					{t('overlayTitle')}
				</span>
				<button
					aria-label={t('overlayClose')}
					className="ml-auto cursor-pointer rounded-md p-1 text-muted-foreground transition-colors [-webkit-app-region:no-drag] hover:bg-muted hover:text-foreground"
					onClick={close}
					type="button"
				>
					<Icon icon="lucide:x" />
				</button>
			</div>

			<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
				<div>
					<p className="font-bold text-muted-foreground text-xs uppercase">
						{t('player')}
					</p>
					<p className="truncate font-semibold">
						{state.player.trim() || '—'}
					</p>
				</div>

				<div className="flex items-center gap-2">
					<span
						className={`rounded-full px-2.5 py-0.5 font-semibold text-xs ring-2 ${STATUS_STYLES[state.status]}`}
					>
						{t(STATUS_KEYS[state.status])}
					</span>
					{newTrade && (
						<span
							className="flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 font-semibold text-primary text-xs ring-2 ring-primary/30"
							data-testid="trading-overlay-new-trade"
						>
							<Icon icon="lucide:refresh-cw" />
							{t('overlayNewTrade')}
						</span>
					)}
					{state.completed && (
						<span className="flex items-center gap-1 font-semibold text-sm text-success">
							<Icon icon="lucide:circle-check" />
							{t('overlayCompleted')}
						</span>
					)}
				</div>

				<div className="flex flex-col gap-1.5">
					{state.items.length === 0 ? (
						<p className="font-semibold text-muted-foreground text-sm">
							{t('overlayEmpty')}
						</p>
					) : (
						state.items.map((row, index) => (
							<div
								className="flex items-baseline justify-between gap-3 text-sm"
								key={index}
							>
								<span className="truncate font-semibold">
									{row.name}
								</span>
								<span
									className={`${montserrat.className} shrink-0 font-semibold text-muted-foreground tabular-nums`}
								>
									×{row.count}
								</span>
							</div>
						))
					)}
				</div>

				<div className="mt-auto rounded-lg bg-primary/10 px-4 py-3">
					<p
						className={`${montserrat.className} font-semibold text-muted-foreground text-xs uppercase`}
					>
						{t('totalPrice')}
					</p>
					<p
						className={`${montserrat.className} font-bold text-3xl tabular-nums`}
					>
						{format(total)}
					</p>
				</div>

				{state.completed ? (
					<div className="flex items-center gap-2 rounded-lg bg-success/15 px-3 py-2.5 text-success ring-2 ring-success/30">
						<Icon className="text-lg" icon="lucide:circle-check" />
						<span className="font-semibold text-sm">
							{t('overlayCompleted')}
						</span>
						{state.completedAt && (
							<span
								className={`${montserrat.className} ml-auto font-semibold text-xs tabular-nums`}
							>
								{formatDate(state.completedAt, 'time')}
							</span>
						)}
					</div>
				) : (
					<div className="flex flex-col gap-2">
						<Button
							className="w-full gap-2"
							disabled={!state.running}
							onClick={complete}
							variant="primary"
						>
							<Icon icon="lucide:handshake" />
							{t('overlayComplete')}
						</Button>
						{!state.running && (
							<p className="text-center font-semibold text-muted-foreground text-xs">
								{t('overlayWait')}
							</p>
						)}
					</div>
				)}
			</div>
		</div>
	)
}
