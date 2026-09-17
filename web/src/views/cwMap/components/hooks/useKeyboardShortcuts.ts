import { useEffect } from 'react'

interface UseKeyboardShortcutsOptions {
	undo: () => void
	saveToLocal: () => void
}

export function useKeyboardShortcuts({
	undo,
	saveToLocal,
}: UseKeyboardShortcutsOptions) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.target instanceof HTMLInputElement) return
			if (e.code === 'KeyZ' && (e.metaKey || e.ctrlKey)) {
				e.preventDefault()
				undo()
			}
			if (e.code === 'KeyS' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
				e.preventDefault()
				saveToLocal()
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [undo, saveToLocal])
}
