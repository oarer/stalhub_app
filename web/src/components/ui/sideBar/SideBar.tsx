'use client'

import { Icon } from '@iconify/react'
import { AnimatePresence, motion } from 'motion/react'
import { memo, type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'

type Props = {
	children: ReactNode
	className?: string
	defaultOpen?: boolean
	id?: string
	side?: 'left' | 'right'
	buttonSideClass?: string

	open?: boolean
	onOpenChange?: (open: boolean) => void
}

const Sidebar = ({
	children,
	className,
	defaultOpen = true,
	id,
	buttonSideClass,
	side = 'left',
	open: openProp,
	onOpenChange,
}: Props) => {
	const [isOpenInternal, setIsOpenInternal] = useState(defaultOpen)
	const [sidebarWidth, setSidebarWidth] = useState(0)
	const [mounted, setMounted] = useState(false)
	const [isMobile, setIsMobile] = useState(false)
	const sidebarRef = useRef<HTMLElement | null>(null)

	useEffect(() => {
		setMounted(true)
		const query = window.matchMedia('(max-width: 639px)')
		const update = () => setIsMobile(query.matches)
		update()
		query.addEventListener('change', update)
		return () => query.removeEventListener('change', update)
	}, [])

	const isOpen = openProp ?? isOpenInternal

	const setOpen = (next: boolean) => {
		if (onOpenChange) onOpenChange(next)
		else setIsOpenInternal(next)
	}

	const isLeft = side === 'left'
	const sidebarSideClass = isLeft ? 'left-4' : 'right-4'
	const sidebarTranslate = isLeft ? -20 : 20
	const openIcon = isLeft ? 'lucide:chevron-left' : 'lucide:chevron-right'
	const closedIcon = isLeft ? 'lucide:chevron-right' : 'lucide:chevron-left'

	useEffect(() => {
		if (!isOpen) return
		if (!sidebarRef.current) return

		const sidebar = sidebarRef.current

		const update = () => {
			setSidebarWidth(sidebar.offsetWidth + 16)
		}

		update()

		const observer = new ResizeObserver(update)
		observer.observe(sidebar)

		return () => observer.disconnect()
	}, [isOpen])

	// Портал в body: fixed-позиция и z-index не должны зависеть
	// от stacking-контекстов предков (трансформы карт/motion),
	// иначе панель уходит под layout-сайдбар.
	if (!mounted) return null

	return createPortal(
		<>
			<AnimatePresence>
				{isOpen && (
					<motion.aside
						animate={{ opacity: 1, x: 0 }}
						className={cn(
							'fixed top-1/2 z-999 flex max-h-[70vh] min-w-70 -translate-y-1/2 flex-col gap-4 overflow-y-auto overflow-x-hidden rounded-lg bg-card/60 p-2 shadow-lg ring-2 ring-primary/60 backdrop-blur-md',
							'max-sm:inset-x-3 max-sm:top-auto max-sm:bottom-[var(--mobile-nav-offset)] max-sm:max-h-[55dvh] max-sm:min-w-0 max-sm:translate-y-0 max-sm:overflow-x-auto',
							sidebarSideClass,
							className
						)}
						exit={{ opacity: 0, x: sidebarTranslate }}
						id={id}
						initial={{ opacity: 0, x: sidebarTranslate }}
						ref={sidebarRef}
						transition={{ duration: 0.4, ease: 'easeInOut' }}
					>
						{children}
					</motion.aside>
				)}
			</AnimatePresence>

			<motion.button
				animate={{
					opacity: 1,
					scale: 1,
					// На мобиле панель — bottom-sheet на всю ширину,
					// кнопку никуда не сдвигаем (иначе улетит за экран).
					x:
						isOpen && !isMobile
							? isLeft
								? sidebarWidth + 4
								: -(sidebarWidth + 4)
							: 0,
				}}
				aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
				className={cn(
					'fixed top-1/2 z-999 -translate-y-1/2 cursor-pointer rounded-xl bg-card/60 p-3 backdrop-blur-xs transition-colors duration-400 hover:bg-muted/30',
					buttonSideClass,
					isLeft ? 'left-5' : 'right-5'
				)}
				initial={{ opacity: 0, scale: 1, x: 0 }}
				onClick={() => setOpen(!isOpen)}
				transition={{
					ease: 'easeInOut',
					duration: 0.25,
				}}
				type="button"
			>
				<AnimatePresence initial={false} mode="wait">
					<motion.span
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 1 }}
						initial={{ opacity: 0, scale: 1 }}
						key={isOpen ? 'close' : 'chevron'}
						transition={{ duration: 0.2, ease: 'easeInOut' }}
					>
						<Icon
							className="text-lg"
							icon={isOpen ? openIcon : closedIcon}
						/>
					</motion.span>
				</AnimatePresence>
			</motion.button>
		</>,
		document.body
	)
}

export default memo(Sidebar)
