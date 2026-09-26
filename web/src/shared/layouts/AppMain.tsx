'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

import { cn } from '@/lib/cn'
import { useSidebarStore } from '@/stores/useSidebar.store'

export function AppMain({ children }: { children: ReactNode }) {
	const collapsed = useSidebarStore((s) => s.collapsed)
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		setMounted(true)
	}, [])

	const isCollapsed = mounted && collapsed

	return (
		<main
			className={cn(
				'app-main min-h-screen pb-[var(--mobile-nav-offset)] pl-0 transition-[padding] duration-300 ease-in-out sm:pb-0',
				isCollapsed ? 'sm:pl-16' : 'sm:pl-72'
			)}
		>
			{children}
		</main>
	)
}