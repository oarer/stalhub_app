import { Suspense, type ReactNode } from 'react'
import type { Viewport } from 'next'

import '@/shared/styles/index.css'
import Script from 'next/script'
import { getLocale, getMessages } from 'next-intl/server'
import { ThemeProvider } from 'next-themes'
import { raleway } from '@/app/fonts'
import { CookieConsent } from '@/components/cookies/CookieConsent'
import { getMetadataByPath } from '@/constants/meta'
// Статическая десктоп-сборка (Tauri) не имеет запросного контекста, локаль
// и сообщения подбираются на клиенте; site-сборка использует LocaleProvider.
const IS_STATIC_EXPORT = process.env.STALHUB_STATIC_EXPORT === '1'
import LocaleProvider from '@/providers/LocaleProvider'
import StaticLocaleProvider from '@/providers/StaticLocaleProvider'
import Providers from '@/providers/providers'
import { GridBackgroundWithBeams } from '@/shared/Background'
import { AppMain } from '@/shared/layouts/AppMain'
import AppSidebar from '@/shared/layouts/AppSidebar'
import { cn } from '@/lib/cn'
import DesktopChromeGate from '@/shared/layouts/DesktopChromeGate'
import MobileNavbar from '@/shared/layouts/MobileNavbar'
import GiveawayModal from '@/shared/layouts/GiveawayModal'
import LoadingSplash from '@/shared/layouts/LoadingSplash'
import ThemeApplier from '@/shared/layouts/nav/components/theme/ThemeApplier'
/* import PageTransitionEffect from '@/shared/transitionEffects/PageTransitionEffect' */

export const viewport: Viewport = {
	width: 'device-width',
	initialScale: 1,
	viewportFit: 'cover',
}

export const generateMetadata = async () => {
	if (IS_STATIC_EXPORT) return getMetadataByPath(undefined)
	const { headers } = await import('next/headers')
	const headersList = await headers()
	const path = headersList.get('X-Path')?.split('?')[0]

	return getMetadataByPath(path)
}

const TRADING_OVERLAY_PATH = '/calcs/trading/overlay'

type LayoutProps = {
	children: ReactNode
}

export default async function RootLayout({ children }: LayoutProps) {
	const locale = await getLocale()
	const messages = await getMessages()
	let isTradingOverlay = false
	if (!IS_STATIC_EXPORT) {
		const { headers } = await import('next/headers')
		const headersList = await headers()
		const path = headersList.get('X-Path')?.split('?')[0]
		isTradingOverlay = path === TRADING_OVERLAY_PATH
	}

	return (
		<html
			className="dark"
			data-scroll-behavior="smooth"
			lang={locale}
			suppressHydrationWarning
		>
			<body
				className={cn(
					`${raleway.className} bg-background text-foreground transition-colors duration-500 ease-in-out`,
					IS_STATIC_EXPORT && 'tauri-app'
				)}
			>
				{!isTradingOverlay && (
					<GridBackgroundWithBeams
						cellSize={20}
						cols={100}
						glowIntensity={1.5}
						lineWidth={2}
						maxBeams={4}
						rows={100}
					/>
				)}
				{!isTradingOverlay && (
					<Script
						data-website-id="47f7941c-8d8d-4976-8cf0-690dfe79f522"
						defer
						src="https://umami.stalhub.dev/script.js"
					/>
				)}
				<Suspense fallback={<div />}>
					<ThemeProvider
						attribute="class"
						disableTransitionOnChange
						enableSystem
					>
						{IS_STATIC_EXPORT ? (
							<StaticLocaleProvider
								initialLocale={locale as 'ru'}
								initialMessages={messages}
							>
								<DesktopChromeGate>{children}</DesktopChromeGate>
							</StaticLocaleProvider>
						) : (
							<>
								{isTradingOverlay ? (
									<LocaleProvider locale={locale} messages={messages}>
										<main className="min-h-screen">{children}</main>
									</LocaleProvider>
								) : (
									<>
										<ThemeApplier />
										<LocaleProvider locale={locale} messages={messages}>
											<ThemeApplier />
											<Providers>
												<LoadingSplash />
												<AppSidebar />
												<MobileNavbar />
												{/* <PageTransitionEffect> */}
												<AppMain>{children}</AppMain>
												{/* </PageTransitionEffect> */}
												<CookieConsent />
												<GiveawayModal />
											</Providers>
										</LocaleProvider>
									</>
								)}
							</>
						)}
					</ThemeProvider>
				</Suspense>
			</body>
		</html>
	)
}
