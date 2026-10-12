'use client'

import { useEffect } from 'react'
import { isTauri } from '@/lib/tauri-bridge'

const VISIBILITY_EVENT = 'stalhub:window-visibility'

export default function WindowVisibilityGuard() {
	useEffect(() => {
		if (!isTauri()) return

		const root = document.documentElement
		const setVisible = (visible: boolean) => {
			root.dataset.stalhubWindowVisible = visible ? 'true' : 'false'
			document.dispatchEvent(
				new CustomEvent<boolean>('stalhub:window-visibility', {
					detail: visible,
				})
			)
		}
		setVisible(true)

		let unlisten: (() => void) | undefined
		void import('@tauri-apps/api/event')
			.then(({ listen }) =>
				listen<boolean>(VISIBILITY_EVENT, (event) => {
					setVisible(event.payload)
				})
			)
			.then((cleanup) => {
				unlisten = cleanup
			})
			.catch(() => undefined)

		return () => {
			unlisten?.()
			delete root.dataset.stalhubWindowVisible
		}
	}, [])

	return null
}