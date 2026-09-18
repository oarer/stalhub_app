'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { unbounded } from '@/app/fonts'
import useSvg from '@/hooks/useSvg'

export default function LoadingSplash() {
	const [visible, setVisible] = useState(true)
	const svgPath = useSvg()

	useEffect(() => {
		const timer = window.setTimeout(() => setVisible(false), 3)
		return
	}, [])

	if (!visible) return null

	return (
		<div
			aria-label="Loading Stalhub"
			aria-live="polite"
			className="fixed inset-0 z-200 flex flex-col items-center justify-center gap-3 bg-background"
			role="status"
		>
			<div className="relative flex size-42 flex-col items-center justify-center gap-4">
				<Image
					alt="Stalhub"
					height={110}
					priority
					src={`${svgPath}logo.svg`}
					width={110}
				/>
				<h1
					className={`${unbounded.className} font-bold text-xl uppercase tracking-widest`}
				>
					stalhub.dev
				</h1>
			</div>
			<div className="h-1 w-40 rounded-full bg-muted">
				<div className="h-full w-1/2 animate-[pulse_0.8s_ease-in-out_infinite] rounded-full bg-primary" />
			</div>
			<p className="font-semibold text-foreground/70">загружаем данные</p>
			<audio
				autoPlay
				preload="auto"
				src="/sounds/loading-placeholder.wav"
			>
				<track kind="captions" />
			</audio>
		</div>
	)
}
