import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type LocalSettings = {
	persistLocalData: boolean
	autoCheckUpdates: boolean
}

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
	persistLocalData: true,
	autoCheckUpdates: true,
}

type AppSettingsState = LocalSettings & {
	setPersistLocalData: (value: boolean) => void
	setAutoCheckUpdates: (value: boolean) => void
	resetSettings: () => void
}

export const useSettingsStore = create<AppSettingsState>()(
	persist(
		(set) => ({
			...DEFAULT_LOCAL_SETTINGS,
			setPersistLocalData: (value) => set({ persistLocalData: value }),
			setAutoCheckUpdates: (value) => set({ autoCheckUpdates: value }),
			resetSettings: () => set(DEFAULT_LOCAL_SETTINGS),
		}),
		{
			name: 'stalhub:settings',
			version: 1,
			storage: createJSONStorage(() => localStorage),
			merge: (persisted, current) => {
				const raw = (persisted ?? {}) as Record<string, unknown>
				const saved = ('state' in raw ? (raw.state as Partial<LocalSettings>) : raw) ?? {}
				return {
					...current,
					persistLocalData: saved.persistLocalData !== false,
					autoCheckUpdates: saved.autoCheckUpdates !== false,
				}
			},
			partialize: (state) => ({
				persistLocalData: state.persistLocalData,
				autoCheckUpdates: state.autoCheckUpdates,
			}),
		}
	)
)