'use client'

import { useVirtualizer } from '@tanstack/react-virtual'
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'react'

type Options = {
	estimateSize?: number
	bottomThreshold?: number
	hasMore?: boolean
	onLoadMore?: () => void
}

function isAppShell() {
	return (
		typeof document !== 'undefined' &&
		document.body.classList.contains('tauri-app')
	)
}

/**
 * Скроллер списка: в аппке документ locked (app-shell) и скроллит
 * main AppMain, на сайте — документ как раньше.
 */
function resolveScroller(container: HTMLElement | null): Element | null {
	if (!container || typeof document === 'undefined') return null
	if (isAppShell()) return container.closest('main.app-main')
	return document.scrollingElement
}

function scrollerMetrics(scroller: Element) {
	if (scroller === document.scrollingElement) {
		return {
			scrollHeight: scroller.scrollHeight,
			scrollTop: window.scrollY,
			clientHeight: window.innerHeight,
		}
	}
	return {
		scrollHeight: scroller.scrollHeight,
		scrollTop: scroller.scrollTop,
		clientHeight: scroller.clientHeight,
	}
}

export function useVirtualizedRows<T>(
	rows: T[][],
	{
		estimateSize = 180,
		bottomThreshold = 500,
		hasMore = false,
		onLoadMore,
	}: Options = {}
) {
	const containerRef = useRef<HTMLDivElement>(null)
	const [scrollMargin, setScrollMargin] = useState(0)
	const onLoadMoreRef = useRef(onLoadMore)
	onLoadMoreRef.current = onLoadMore

	const virtualizer = useVirtualizer({
		count: rows.length,
		estimateSize: () => estimateSize,
		overscan: 5,
		scrollMargin,
		getScrollElement: () => resolveScroller(containerRef.current),
	})

	const loadMore = useCallback(() => {
		onLoadMoreRef.current?.()
	}, [])

	useLayoutEffect(() => {
		const update = () => {
			const container = containerRef.current
			const scroller = resolveScroller(container)
			if (!container || !scroller) return
			const rect = container.getBoundingClientRect()
			if (scroller === document.scrollingElement) {
				setScrollMargin(rect.top + window.scrollY)
			} else {
				const scrollerRect = scroller.getBoundingClientRect()
				setScrollMargin(
					rect.top - scrollerRect.top + scroller.scrollTop
				)
			}
		}
		update()
		window.addEventListener('resize', update)
		return () => window.removeEventListener('resize', update)
	}, [])

	const checkBottom = useCallback(() => {
		const scroller = resolveScroller(containerRef.current)
		if (!scroller) return false
		const { scrollHeight, scrollTop, clientHeight } =
			scrollerMetrics(scroller)
		return scrollHeight - scrollTop - clientHeight < bottomThreshold
	}, [bottomThreshold])

	/* biome-ignore lint/correctness/useExhaustiveDependencies: re-check the bottom after rows grow to auto-fill */
	useEffect(() => {
		if (!hasMore) return
		if (checkBottom()) {
			loadMore()
		}
	}, [hasMore, bottomThreshold, rows.length, loadMore, checkBottom])

	useEffect(() => {
		if (!hasMore) return
		const scroller = resolveScroller(containerRef.current)
		if (!scroller) return
		// Документ скроллится окном, main AppMain — сам по себе.
		const target = scroller === document.scrollingElement ? window : scroller
		const onScroll = () => {
			if (checkBottom()) {
				loadMore()
			}
		}
		target.addEventListener('scroll', onScroll, { passive: true })
		return () => target.removeEventListener('scroll', onScroll)
	}, [hasMore, loadMore, checkBottom])

	return {
		containerRef,
		virtualizer,
		visibleRows: rows,
	}
}
