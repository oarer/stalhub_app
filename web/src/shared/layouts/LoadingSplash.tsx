'use client'

import { AnimatePresence, motion } from 'motion/react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { unbounded } from '@/app/fonts'
import useSvg from '@/hooks/useSvg'
import { type CatalogPhase, loadCatalog } from '@/lib/catalogPreload'
import { cn } from '@/lib/cn'

const MIN_SETTLED = 800
const MAX_VISIBLE = 6000

export default function LoadingSplash() {
	const t = useTranslations('splash')
	const [visible, setVisible] = useState(true)
	const [phase, setPhase] = useState<CatalogPhase>('checking')
	const svgPath = useSvg()

	useEffect(() => {
		let active = true
		let settled = false

		const finish = () => {
			if (!active || settled) return
			settled = true

			window.setTimeout(() => {
				if (active) setVisible(false)
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

	return (
		<AnimatePresence>
			{visible && (
				<motion.div
					aria-label="Loading Stalhub"
					aria-live="polite"
					className="fixed inset-0 z-200 flex flex-col items-center justify-center gap-3 bg-background"
					exit={{
						opacity: 0,
						transition: { duration: 0.4, ease: 'easeInOut' },
					}}
					role="status"
				>
					<motion.div
						animate={{ opacity: 1, scale: 1, y: 0 }}
						className="relative flex size-42 flex-col items-center justify-center gap-4"
						initial={{ opacity: 0, scale: 0.9, y: 12 }}
						transition={{ duration: 0.5, ease: 'easeOut' }}
					>
						<motion.div
							animate={
								settledPhase
									? { opacity: 1, scale: 1 }
									: { opacity: 1, scale: [1, 1.05, 1] }
							}
							initial={{ opacity: 0, scale: 0.8 }}
							transition={
								settledPhase
									? { duration: 0.4, ease: 'easeOut' }
									: {
											opacity: {
												duration: 0.6,
												ease: 'easeOut',
											},
											scale: {
												duration: 2,
												repeat: Number.POSITIVE_INFINITY,
												ease: 'easeInOut',
											},
										}
							}
						>
							<Image
								alt="Stalhub"
								height={110}
								priority
								src={`${svgPath}logo.svg`}
								width={110}
							/>
						</motion.div>
						<motion.h1
							animate={{ opacity: 1, y: 0 }}
							className={`${unbounded.className} font-bold text-xl uppercase tracking-widest`}
							initial={{ opacity: 0, y: 8 }}
							transition={{
								duration: 0.5,
								ease: 'easeOut',
								delay: 0.15,
							}}
						>
							stalhub.dev
						</motion.h1>
					</motion.div>

					<div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
						{settledPhase ? (
							<motion.div
								animate={{ width: '100%' }}
								className={cn(
									'h-full rounded-full',
									phase === 'offline'
										? 'bg-destructive'
										: 'bg-primary'
								)}
								initial={{ width: '0%' }}
								transition={{ duration: 0.5, ease: 'easeOut' }}
							/>
						) : (
							<motion.div
								animate={{ x: ['-100%', '200%'] }}
								className="h-full w-1/2 rounded-full bg-primary"
								transition={{
									duration: 1.2,
									ease: 'easeInOut',
									repeat: Number.POSITIVE_INFINITY,
								}}
							/>
						)}
					</div>

					<div className="relative flex h-6 items-center justify-center">
						<AnimatePresence mode="wait">
							<motion.p
								animate={{ opacity: 1, y: 0 }}
								className={cn(
									'font-semibold',
									phase === 'offline'
										? 'text-destructive'
										: phase === 'done'
											? 'text-success'
											: 'text-foreground/70'
								)}
								exit={{ opacity: 0, y: -6 }}
								initial={{ opacity: 0, y: 6 }}
								key={phase}
								transition={{ duration: 0.25, ease: 'easeOut' }}
							>
								{statusText}
							</motion.p>
						</AnimatePresence>
					</div>

					<audio
						autoPlay
						preload="auto"
						src="/sounds/loading-placeholder.wav"
					>
						<track kind="captions" />
					</audio>
				</motion.div>
			)}
		</AnimatePresence>
	)
}
