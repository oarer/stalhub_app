'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { CookieConsent } from '@/components/cookies/CookieConsent'
import Providers from '@/providers/providers'
import { AppMain } from '@/shared/layouts/AppMain'
import AppSidebar from '@/shared/layouts/AppSidebar'
import MobileNavbar from '@/shared/layouts/MobileNavbar'
import GiveawayModal from '@/shared/layouts/GiveawayModal'
import LoadingSplash from '@/shared/layouts/LoadingSplash'
import ThemeApplier from '@/shared/layouts/nav/components/theme/ThemeApplier'

// Десктоп (static export): у серверного layout нет headers(), поэтому
// overlay-окно (/calcs/trading/overlay) определяется на клиенте по pathname.
// Prerender печёт правильный вариант под каждый роут; Suspense-граница
// для usePathname есть выше по дереву (RootLayout).
export default function DesktopChromeGate({
	children,
}: {
	children: ReactNode
}) {
	const pathname = usePathname()

	if (pathname === '/calcs/trading/overlay') {
		// body locked в аппке: оверлею нужен свой скроллер.
		return <main className="h-full min-h-screen overflow-y-auto">{children}</main>
	}

	return (
		<>
			<ThemeApplier />
			<Providers>
				<LoadingSplash />
				<AppSidebar />
				<MobileNavbar />
				<AppMain>{children}</AppMain>
				<CookieConsent />
				<GiveawayModal />
			</Providers>
		</>
	)
}
