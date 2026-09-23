'use client'

import { NextIntlClientProvider } from 'next-intl'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { defaultLocale, type Locale } from '@/i18n/settings'

const VALID_LOCALES: Record<string, Locale> = {
	ru: 'ru',
	en: 'en',
	es: 'es',
	fr: 'fr',
	ko: 'ko',
}

function detectLocale(): Locale {
	if (typeof document === 'undefined') return defaultLocale
	const match = document.cookie.match(/(?:^|; )lang=([^;]*)/)?.[1]
	if (match && match in VALID_LOCALES) return VALID_LOCALES[match]
	const nav = (navigator.language || 'ru').split('-')[0].toLowerCase()
	if (nav in VALID_LOCALES) return VALID_LOCALES[nav]
	return defaultLocale
}

const MESSAGES: { [key in Locale]?: { messages: unknown; markers: unknown } } = {}

async function loadLocale(locale: Locale) {
	if (MESSAGES[locale]) return MESSAGES[locale]!
	const [messages, markers] = await Promise.all([
		import(`@/locales/${locale}.json`),
		import(`@/locales/markers/${locale}.json`),
	])
	const value = { messages: messages.default, markers: markers.default }
	MESSAGES[locale] = value
	return value
}

export default function StaticLocaleProvider({
	children,
	initialLocale,
	initialMessages,
}: {
	children: ReactNode
	initialLocale: Locale
	initialMessages: Record<string, unknown>
}) {
	const [locale, setLocale] = useState<Locale>(initialLocale)
	const [messages, setMessages] = useState<Record<string, unknown>>(
		initialMessages
	)

	useEffect(() => {
		const detected = detectLocale()
		if (detected !== initialLocale) {
			setLocale(detected)
			void loadLocale(detected).then(({ messages, markers }) => {
				setMessages({ ...messages, markers })
			})
		}
	}, [initialLocale])

	const providerMessages = useMemo(
		() => (messages && Object.keys(messages).length > 0 ? messages : initialMessages),
		[messages, initialMessages]
	)

	return (
		<NextIntlClientProvider
			getMessageFallback={({ namespace, key }) =>
				`${namespace ? `${namespace}.` : ''}${key}`
			}
			locale={locale}
			messages={providerMessages}
			onError={(error) => {
				if (error.code === 'MISSING_MESSAGE') return
			}}
		>
			{children}
		</NextIntlClientProvider>
	)
}