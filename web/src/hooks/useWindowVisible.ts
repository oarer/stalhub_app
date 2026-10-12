'use client'

import { useEffect, useState } from 'react'

const VISIBILITY_EVENT = 'stalhub:window-visibility'

export function useWindowVisible(): boolean {
	const [visible, setVisible] = useState(true)

	useEffect(() => {
		const onVisibility = (event: Event) => {
			const next = (event as CustomEvent<boolean>).detail
			if (typeof next === 'boolean') setVisible(next)
		}
		document.addEventListener(VISIBILITY_EVENT, onVisibility)
		return () => document.removeEventListener(VISIBILITY_EVENT, onVisibility)
	}, [])

	return visible
}