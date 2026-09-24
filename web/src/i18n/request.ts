import { cookies } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { defaultLocale, type Locale } from './settings'

// Десктоп-сборка (Tauri) использует статический export: запросного контекста
// в момент prerender нет, поэтому cookies() недоступен. Локаль и сообщения
// подбираются на клиенте (см. providers/StaticLocaleProvider.tsx).
const isStaticExport = process.env.STALHUB_STATIC_EXPORT === '1'

async function getLocaleFromCookie(): Promise<Locale | undefined> {
	if (isStaticExport) return undefined

	const cookieStore = await cookies()
	const match = cookieStore.get('lang')?.value

	if (
		match === 'ru' ||
		match === 'en' ||
		match === 'es' ||
		match === 'fr' ||
		match === 'ko'
	) {
		return match
	}

	return undefined
}

export default getRequestConfig(async () => {
	const locale = (await getLocaleFromCookie()) ?? defaultLocale

	const [messages, markers] = await Promise.all([
		import(`@/locales/${locale}.json`).then((m) => m.default),
		import(`@/locales/markers/${locale}.json`).then((m) => m.default),
	])

	return {
		locale,
		messages: { ...messages, markers },
	}
})