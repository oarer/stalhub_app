import { type Locale, VALID_LOCALES } from '@/types/item.type'

const IS_STATIC_EXPORT = process.env.STALHUB_STATIC_EXPORT === '1'

export const getLocaleServer = async (): Promise<Locale> => {
	// Десктоп-сборка (Tauri) — статический export: headers() недоступен.
	if (IS_STATIC_EXPORT) return 'ru'

	const { headers } = await import('next/headers')
	const headerList = await headers()

	const langCookie = headerList
		.get('cookie')
		?.match(/(?:^|; )lang=([^;]*)/)?.[1]
	if (langCookie && VALID_LOCALES.has(langCookie)) {
		return langCookie as Locale
	}

	const acceptLang = headerList.get('accept-language') || 'ru'
	const locale = acceptLang.split(',')[0].split('-')[0]
	if (locale && VALID_LOCALES.has(locale)) {
		return locale as Locale
	}

	return 'ru'
}
