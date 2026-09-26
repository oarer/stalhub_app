'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { unbounded } from '@/app/fonts'
import useSvg from '@/hooks/useSvg'
import { type CatalogPhase, loadCatalog } from '@/lib/catalogPreload'
import { cn } from '@/lib/cn'

const MIN_SETTLED = 800
const MAX_VISIBLE = 6000
const FADE_OUT_MS = 400

// Сознательно без motion/react и next/image: WAAPI-анимации вешают
// композитор WebKitGTK на битых GPU-стеках (NVIDIA + Wayland) —
// exit-анимация AnimatePresence не завершается и шторка никогда
// не размонтируется, накрывая приложение. Появление/уход —
// CSS transition + таймеры
export default function LoadingSplash() {
	const t = useTranslations('splash')
	const [visible, setVisible] = useState(true)
	const [leaving, setLeaving] = useState(false)
	const [phase, setPhase] = useState<CatalogPhase>('checking')
	const svgPath = useSvg()

	useEffect(() => {
		let active = true
		let settled = false

		const finish = () => {
			if (!active || settled) return
			settled = true

			window.setTimeout(() => {
				if (!active) return
				setLeaving(true)
				window.setTimeout(() => {
					if (active) setVisible(false)
				}, FADE_OUT_MS)
			}, MIN_SETTLED)
		}

		const fallback = window.setTimeout(() => {
			if (active) setVisible(false)
		}, MAX_VISIBLE)

		void loadCatalog({
			onPhase: (next) => {
				if (!active || settled) return
				setPhase(next)
				if (next === 'done' || next === 'offline') finish()
			},
		}).then((result) => {
			if (!active || settled) return
			setPhase(result.status === 'offline' ? 'offline' : 'done')
			finish()
		})

		return () => {
			active = false
			window.clearTimeout(fallback)
		}
	}, [])

	const settledPhase = phase === 'done' || phase === 'offline'

	const statusText =
		phase === 'checking'
			? t('checking')
			: phase === 'downloading'
				? t('loading')
				: phase === 'offline'
					? t('offline')
					: t('ready')

	if (!visible) return null

	return (
		<div
			aria-label="Loading Stalhub"
			aria-live="polite"
			className={cn(
				'fixed inset-0 z-[1200] flex flex-col items-center justify-center gap-3 bg-background transition-opacity duration-400',
				leaving ? 'opacity-0' : 'opacity-100'
			)}
			role="status"
		>
			<div className="relative flex size-42 flex-col items-center justify-center gap-4">
				<img
					alt="Stalhub"
					height={110}
					src={`${svgPath}logo.svg`}
					width={110}
				/>
				<h1
					className={`${unbounded.className} font-bold text-xl uppercase tracking-widest`}
				>
					stalhub.dev
				</h1>
			</div>

			<div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
				{settledPhase ? (
					<div
						className={cn(
							'h-full rounded-full transition-[width] duration-500',
							phase === 'offline'
								? 'bg-destructive'
								: 'bg-primary'
						)}
						style={{ width: '100%' }}
					/>
				) : (
					<div className="h-full w-1/2 animate-[splash-slide_1.2s_ease-in-out_infinite] rounded-full bg-primary" />
				)}
			</div>

			<div className="relative flex h-6 items-center justify-center">
				<p
					className={cn(
						'font-semibold',
						phase === 'offline'
							? 'text-destructive'
							: phase === 'done'
								? 'text-success'
								: 'text-foreground/70'
					)}
					key={phase}
				>
					{statusText}
				</p>
			</div>

			<audio autoPlay preload="auto" src="/sounds/boot.mp3">
				<track kind="captions" />
			</audio>
			<style>{`@keyframes splash-slide { from { transform: translateX(-100%); } to { transform: translateX(200%); } }`}</style>
		</div>
	)
}
