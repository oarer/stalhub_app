import { contextBridge, ipcRenderer } from 'electron'

const listeners = new Set<(url: string) => void>()
ipcRenderer.on('stalhub:auth-callback', (_event, url: unknown) => {
	if (typeof url !== 'string') return
	for (const listener of listeners) {
		try {
			listener(url)
		} catch {
			/* One subscriber must not block the others. */
		}
	}
	window.dispatchEvent(
		new CustomEvent('stalhub:auth-callback', { detail: url })
	)
})

const importListeners = new Set<(url: string) => void>()
ipcRenderer.on('stalhub:import', (_event, url: unknown) => {
	if (typeof url !== 'string') return
	for (const listener of importListeners) {
		try {
			listener(url)
		} catch {
			/* One subscriber must not block the others. */
		}
	}
	window.dispatchEvent(
		new CustomEvent('stalhub:import', { detail: url })
	)
})

const overlayStateListeners = new Set<(state: unknown) => void>()
const overlayCompleteListeners = new Set<() => void>()
ipcRenderer.on('stalhub:trading-overlay:state', (_event, state: unknown) => {
	for (const listener of overlayStateListeners) {
		try {
			listener(state)
		} catch {
			/* One subscriber must not block the others. */
		}
	}
})
ipcRenderer.on('stalhub:trading-overlay:complete', () => {
	for (const listener of overlayCompleteListeners) {
		try {
			listener()
		} catch {
			/* One subscriber must not block the others. */
		}
	}
})

const updateListeners = new Set<(state: unknown) => void>()
ipcRenderer.on('stalhub:updates:status', (_event, state: unknown) => {
	for (const listener of updateListeners) {
		try {
			listener(state)
		} catch {
			/* One subscriber must not block the others. */
		}
	}
})

contextBridge.exposeInMainWorld(
	'stalhubDesktop',
	Object.freeze({
		platform: process.platform,
		beginAuth: (url: string): Promise<void> =>
			ipcRenderer.invoke('stalhub:begin-auth', url),
		openExternal: (url: string): Promise<void> =>
			ipcRenderer.invoke('stalhub:open-external', url),
		updates: Object.freeze({
			info: (): Promise<unknown> =>
				ipcRenderer.invoke('stalhub:updates:info'),
			check: (): Promise<unknown> =>
				ipcRenderer.invoke('stalhub:updates:check'),
			setAutoUpdate: (enabled: boolean): Promise<unknown> =>
				ipcRenderer.invoke('stalhub:updates:set-auto', enabled),
			restart: (): void => ipcRenderer.send('stalhub:updates:restart'),
			onStatus: (callback: (state: unknown) => void) => {
				if (typeof callback !== 'function')
					throw new TypeError('Expected callback')
				updateListeners.add(callback)
				return () => {
					updateListeners.delete(callback)
				}
			},
		}),
		onAuthCallback: (callback: (url: string) => void) => {
			if (typeof callback !== 'function')
				throw new TypeError('Expected callback')
			listeners.add(callback)
			ipcRenderer.send('stalhub:renderer-ready')
			return () => {
				listeners.delete(callback)
				if (listeners.size === 0)
					ipcRenderer.send('stalhub:renderer-not-ready')
			}
		},
		onImport: (callback: (url: string) => void) => {
			if (typeof callback !== 'function')
				throw new TypeError('Expected callback')
			importListeners.add(callback)
			ipcRenderer.send('stalhub:import-ready')
			return () => {
				importListeners.delete(callback)
				if (importListeners.size === 0)
					ipcRenderer.send('stalhub:import-not-ready')
			}
		},
		tradingOverlay: Object.freeze({
			open: (): Promise<boolean> =>
				ipcRenderer.invoke('stalhub:trading-overlay:open'),
			update: (state: unknown): void =>
				ipcRenderer.send('stalhub:trading-overlay:update', state),
			close: (): Promise<boolean> =>
				ipcRenderer.invoke('stalhub:trading-overlay:close'),
			complete: (): void =>
				ipcRenderer.send('stalhub:trading-overlay:complete'),
			onState: (callback: (state: unknown) => void) => {
				if (typeof callback !== 'function')
					throw new TypeError('Expected callback')
				overlayStateListeners.add(callback)
				return () => {
					overlayStateListeners.delete(callback)
				}
			},
			onComplete: (callback: () => void) => {
				if (typeof callback !== 'function')
					throw new TypeError('Expected callback')
				overlayCompleteListeners.add(callback)
				return () => {
					overlayCompleteListeners.delete(callback)
				}
			},
		}),
	})
)
