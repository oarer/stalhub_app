import { useSettingsStore } from '@/stores/useSettings.store'

export function isLocalPersistenceEnabled() {
	return useSettingsStore.getState().persistLocalData
}

export function clearBrowserData() {
	if (typeof window === 'undefined') return

	localStorage.clear()
	document.cookie.split(';').forEach((cookie) => {
		const name = cookie.split('=')[0]?.trim()
		if (name) document.cookie = `${name}=; path=/; max-age=0`
	})
}