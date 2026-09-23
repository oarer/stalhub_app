'use client'

import { usePathname } from 'next/navigation'
import { type ReactNode, useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import ImportDeeplinkHandler from '@/components/import/ImportDeeplinkHandler'
import { UwuProvider } from '@/providers/uwuProvider'
import { userService } from '@/services/user/user.service'
import { initTauriBridge } from '@/lib/tauri-bridge'
import { useAuthStore } from '@/stores/useAuth.store'
import { useBanStore } from '@/stores/useBan.store'
import BannedView from '@/views/errors/banned/BannedView'
import QueryProvider from './QueryProvider'

interface Props {
	children: ReactNode
}

export default function Providers({ children }: Props) {
	const [mounted, setMounted] = useState(false)
	const pathname = usePathname()
	const isBanned = useBanStore((s) => s.isBanned)
	const setUser = useAuthStore((s) => s.setUser)

	useEffect(() => {
		setMounted(true)
		// Tauri-шим window.stalhubDesktop: no-op вне Tauri-webview (сайт),
		// не ставится поверх Electron-preload. Идемпотентен.
		initTauriBridge()

		if (pathname.startsWith('/auth')) return

		const controller = new AbortController()
		let active = true

		userService
			.getMe({ skipAuthRefresh: true, signal: controller.signal })
			.then((user) => {
				if (active) setUser(user)
			})
			.catch(() => {
				if (active && !controller.signal.aborted) setUser(null)
			})

		console.log(
			`%cЧувак, ты думал тут что-то будет?\n` +
				`%cДавай, закрывай девтулс и продолжай пользоваться сайтом`,
			'font-size: 1.5rem; color: #EA9D9E; font-weight: bold;',
			'font-size: 1.2rem; color: #4caf50; font-style: italic;'
		)
		return () => {
			active = false
			controller.abort()
		}
	}, [pathname, setUser])

	if (!mounted) return null

	if (isBanned) {
		return (
			<QueryProvider>
				<UwuProvider>
					<Toaster position="bottom-right" />
					<BannedView />
				</UwuProvider>
			</QueryProvider>
		)
	}

	return (
		<QueryProvider>
			<UwuProvider>
				<Toaster position="bottom-right" />
				<ImportDeeplinkHandler />
				{children}
			</UwuProvider>
		</QueryProvider>
	)
}
