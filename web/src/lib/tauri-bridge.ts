// Шим window.stalhubDesktop поверх Tauri (Фаза 2).
// Сохраняет JS-контракт Electron-preload (см. web/src/types/electron.d.ts),
// чтобы views/services не менялись: desktop-auth, localData, TradingView,
// TradingOverlay, UpdatesSection работают как раньше.
//
// Правила:
// - Не ставится поверх существующего window.stalhubDesktop (Electron) и вне
//   Tauri-webview (сайт) — там мост отсутствует, как и раньше.
// - Все Tauri-модули грузятся динамически, чтобы не раздувать бандл сайта.
// - tradingOverlay управляет окном overlay (Фаза 4): open/close через
//   WebviewWindow, update/complete через emitTo, onState/onComplete —
//   локальные refcounted-подписки. Направление complete — overlay→main,
//   как в main.ts Electron.
// - updates работает уже сейчас, но без Rust-бэкенда апдейтера (Фаза 6)
//   рапортует supported:false; setAutoUpdate персистится через plugin-store.
// - platform маппится к Node-стилю Electron (darwin/win32), который ждёт бэкенд.
import type {
	DesktopUpdatesApi,
	DesktopUpdateState,
	UpdateChannel,
} from '@/types/electron'
import type { TauriInboundEvent } from '@/types/tauri'
import type { TradingOverlayState } from '@/views/calcs/trading/trading'

const AUTH_EVENT: TauriInboundEvent = 'stalhub:auth-callback'
const IMPORT_EVENT: TauriInboundEvent = 'stalhub:import'
const OVERLAY_STATE_EVENT = 'stalhub:trading-overlay:state'
const OVERLAY_COMPLETE_EVENT = 'stalhub:trading-overlay:complete'
const SETTINGS_STORE = 'stalhub-settings.dat'

let installed = false
let installing: Promise<void> | null = null

export function isTauri(): boolean {
	if (typeof window === 'undefined') return false
	const w = window as unknown as Record<string, unknown>
	return '__TAURI_INTERNALS__' in w || '__TAURI__' in w
}

export function initTauriBridge(): void {
	if (typeof window === 'undefined') return
	if (window.stalhubDesktop || !isTauri()) return
	if (installed || installing) return
	installing = install()
		.then(() => {
			installed = true
		})
		.catch((error) => {
			console.warn('[tauri-bridge] install failed', error)
		})
		.finally(() => {
			installing = null
		})
}

function dispatchDomEvent(name: TauriInboundEvent, detail: string): void {
	window.dispatchEvent(new CustomEvent(name, { detail }))
}

function toNodePlatform(platform: string): string | undefined {
	if (platform === 'macos') return 'darwin'
	if (platform === 'windows') return 'win32'
	// Бэк валидирует platform паттерном ^(aix|darwin|freebsd|linux|openbsd|sunos|win32)$ —
	// mobile-значений там нет, поэтому их не шлём (поле опционально,
	// бэк подставит user-agent в подпись сессии).
	if (platform === 'android' || platform === 'ios') return undefined
	return platform
}

async function install(): Promise<void> {
	const [{ openUrl }, { platform }, { listen }, { getVersion }, { load }] =
		await Promise.all([
			import('@tauri-apps/plugin-opener'),
			import('@tauri-apps/plugin-os'),
			import('@tauri-apps/api/event'),
			import('@tauri-apps/api/app'),
			import('@tauri-apps/plugin-store'),
		])

	const rawPlatform = platform()
	const nodePlatform = toNodePlatform(rawPlatform)
	const isAndroid = rawPlatform === 'android'

	const currentVersion = await getVersion().catch(() => 'unknown')
	const settings = await load(SETTINGS_STORE).catch(() => null)
	const autoUpdate =
		(await settings?.get<boolean>('autoUpdate').catch(() => null)) ?? true
	// Канал обновлений: только Android (десктоп игнорит, там plugin-updater).
	const storedChannel = await settings
		?.get<UpdateChannel>('updateChannel')
		.catch(() => null)
	let initialChannel: UpdateChannel | null = null
	if (isAndroid) {
		initialChannel = storedChannel === 'prerelease' ? 'prerelease' : 'stable'
	}

	// --- deep-link подписки (ленивые, как в preload) ---
	const authListeners = new Set<(url: string) => void>()
	const importListeners = new Set<(url: string) => void>()
	let authUnlisten: (() => void) | null = null
	let importUnlisten: (() => void) | null = null
	let authSubscribing: Promise<void> | null = null
	let importSubscribing: Promise<void> | null = null

	const notifyRenderer = (channel: 'auth' | 'import', ready: boolean) => {
		void import('@tauri-apps/api/core')
			.then(({ invoke }) =>
				invoke(ready ? 'renderer_ready' : 'renderer_not_ready', { channel })
			)
			.catch(() => {
				/* Rust-очередь подождёт следующего handshake. */
			})
	}

	const handleAuthEvent = (url: string) => {
		dispatchDomEvent(AUTH_EVENT, url)
		for (const listener of authListeners) {
			try {
				listener(url)
			} catch {
				/* Один подписчик не должен ломать остальных. */
			}
		}
	}

	const handleImportEvent = (url: string) => {
		dispatchDomEvent(IMPORT_EVENT, url)
		for (const listener of importListeners) {
			try {
				listener(url)
			} catch {
				/* Один подписчик не должен ломать остальных. */
			}
		}
	}

	// Подписка + handshake: renderer_ready вызываем только после того, как
	// listen встал, иначе flush из Rust-очереди потеряется.
	const ensureAuthSubscription = (): Promise<void> => {
		if (authUnlisten || authListeners.size === 0) return Promise.resolve()
		authSubscribing ??= listen<string>(AUTH_EVENT, (event) => {
			if (typeof event.payload === 'string') handleAuthEvent(event.payload)
		})
			.then((unlisten) => {
				authSubscribing = null
				if (authListeners.size === 0) {
					unlisten()
				} else {
					authUnlisten = unlisten
				}
			})
			.catch(() => {
				authSubscribing = null
			})
		return authSubscribing
	}

	const ensureImportSubscription = (): Promise<void> => {
		if (importUnlisten || importListeners.size === 0) return Promise.resolve()
		importSubscribing ??= listen<string>(IMPORT_EVENT, (event) => {
			if (typeof event.payload === 'string') handleImportEvent(event.payload)
		})
			.then((unlisten) => {
				importSubscribing = null
				if (importListeners.size === 0) {
					unlisten()
				} else {
					importUnlisten = unlisten
				}
			})
			.catch(() => {
				importSubscribing = null
			})
		return importSubscribing
	}

	// --- updates (полный цикл — в Фазе 6, пока честный unsupported) ---
	const updateListeners = new Set<(state: DesktopUpdateState) => void>()
	let updateState: DesktopUpdateState = {
		supported: false,
		currentVersion,
		autoUpdate,
		status: 'unsupported',
		newVersion: null,
		percent: null,
		error: null,
		lastCheckedAt: null,
		channel: initialChannel,
	}
	let checking = false

	type AndroidUpdateInfo = {
		currentVersion: string
		latestVersion: string
		notes: string | null
		url: string
		needsUpdate: boolean
	}

	// Android: свой цикл через Rust-команды (plugin-updater — только десктоп).
	// После скачивания открывается системный установщик, дальше — там.
	const downloadAndInstallAndroid = async (url: string): Promise<void> => {
		try {
			const { invoke } = await import('@tauri-apps/api/core')
			emitUpdate({ status: 'downloading', percent: 0 })
			const downloaded = await invoke<{ path: string; size: number }>(
				'android_download_update',
				{ url }
			)
			emitUpdate({ status: 'downloading', percent: 100 })
			await invoke('android_install_update', {
				path: downloaded.path,
			})
			emitUpdate({ status: 'downloaded', percent: 100 })
		} catch (error: unknown) {
			emitUpdate({
				status: 'error',
				error: error instanceof Error ? error.message : String(error),
			})
		}
	}

	const checkAndroidUpdate = async (): Promise<DesktopUpdateState> => {
		checking = true
		emitUpdate({ status: 'checking', percent: null, error: null })
		try {
			const { invoke } = await import('@tauri-apps/api/core')
			const info = await invoke<AndroidUpdateInfo>(
				'android_check_update',
				{
					manifestUrl: null,
					channel: updateState.channel ?? 'stable',
				}
			)
			emitUpdate({
				supported: true,
				currentVersion: info.currentVersion,
				lastCheckedAt: Date.now(),
			})
			if (!info.needsUpdate) {
				emitUpdate({ status: 'not-available', newVersion: null })
				return { ...updateState }
			}
			emitUpdate({
				status: 'available',
				newVersion: info.latestVersion,
				percent: 0,
			})
			void downloadAndInstallAndroid(info.url)
			return { ...updateState }
		} catch (error: unknown) {
			emitUpdate({
				supported: true,
				status: 'error',
				error: error instanceof Error ? error.message : String(error),
				lastCheckedAt: Date.now(),
			})
			return { ...updateState }
		} finally {
			checking = false
		}
	}

	const emitUpdate = (patch: Partial<DesktopUpdateState>) => {
		updateState = { ...updateState, ...patch }
		const snapshot = { ...updateState }
		for (const listener of updateListeners) {
			try {
				listener(snapshot)
			} catch {
				/* Один подписчик не должен ломать остальных. */
			}
		}
	}

	const updates: DesktopUpdatesApi = {
		info: async () => ({ ...updateState }),
		check: async () => {
			if (checking) return { ...updateState }
			if (isAndroid) return checkAndroidUpdate()
			checking = true
			emitUpdate({ status: 'checking', percent: null, error: null })
			try {
				const { check } = await import('@tauri-apps/plugin-updater')
				const update = await check()
				if (!update) {
					emitUpdate({
						supported: true,
						status: 'not-available',
						newVersion: null,
						lastCheckedAt: Date.now(),
					})
					return { ...updateState }
				}
				const current = update
				emitUpdate({
					supported: true,
					status: 'available',
					newVersion: current.version,
					percent: 0,
					lastCheckedAt: Date.now(),
				})
				void current
					.downloadAndInstall((event) => {
						if (event.event === 'Started') {
							emitUpdate({ status: 'downloading', percent: 0 })
						} else if (event.event === 'Progress') {
							emitUpdate({ status: 'downloading' })
						} else if (event.event === 'Finished') {
							emitUpdate({ status: 'downloaded', percent: 100 })
						}
					})
					.then(() => {
						emitUpdate({ status: 'downloaded', percent: 100 })
					})
					.catch((error: unknown) => {
						emitUpdate({
							status: 'error',
							error:
								error instanceof Error ? error.message : String(error),
						})
					})
				return { ...updateState }
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error)
				const missingBackend = /not found|not registered|unsupported/i.test(
					message
				)
				// Rust-бэкенд апдейтера появится в Фазе 6 (ключи/endpoints).
				emitUpdate({
					supported: missingBackend ? false : updateState.supported,
					status: missingBackend ? 'unsupported' : 'error',
					error: missingBackend ? null : message,
					lastCheckedAt: Date.now(),
				})
				return { ...updateState }
			} finally {
				checking = false
			}
		},
		setAutoUpdate: async (enabled: boolean) => {
			try {
				await settings?.set('autoUpdate', enabled)
				await settings?.save()
			} catch {
				/* Память переживёт рестарт и без store; состояние держим локально. */
			}
			emitUpdate({ autoUpdate: enabled })
			return { ...updateState }
		},
		setChannel: async (channel: UpdateChannel) => {
			if (channel !== 'stable' && channel !== 'prerelease') {
				throw new TypeError('Expected stable or prerelease channel')
			}
			try {
				await settings?.set('updateChannel', channel)
				await settings?.save()
			} catch {
				/* См. setAutoUpdate выше. */
			}
			emitUpdate({ channel })
			return { ...updateState }
		},
		restart: () => {
			void import('@tauri-apps/plugin-process')
				.then(({ relaunch }) => relaunch())
				.catch((error: unknown) => {
					console.warn('[tauri-bridge] restart failed', error)
				})
		},
		onStatus: (callback: (state: DesktopUpdateState) => void) => {
			if (typeof callback !== 'function')
				throw new TypeError('Expected callback')
			updateListeners.add(callback)
			return () => {
				updateListeners.delete(callback)
			}
		},
	}

	// --- trading overlay (окно overlay, см. tauri.conf.json) ---
	// Один Tauri-listen на канал с refcount: переподписки views не плодят
	// дубликаты (TradingView переподписывает onComplete при смене running).
	const createLocalChannel = <T,>(event: string) => {
		const listeners = new Set<(payload: T) => void>()
		let unlisten: (() => void) | null = null
		let subscribing: Promise<void> | null = null
		const ensure = (): Promise<void> => {
			if (unlisten || listeners.size === 0) return Promise.resolve()
			subscribing ??= listen<T>(event, (tauriEvent) => {
				for (const listener of [...listeners]) {
					try {
						listener(tauriEvent.payload)
					} catch {
						/* Один подписчик не должен ломать остальных. */
					}
				}
			})
				.then((u) => {
					subscribing = null
					if (listeners.size === 0) {
						u()
					} else {
						unlisten = u
					}
				})
				.catch(() => {
					subscribing = null
				})
			return subscribing
		}
		return {
			subscribe(callback: (payload: T) => void) {
				if (typeof callback !== 'function')
					throw new TypeError('Expected callback')
				listeners.add(callback)
				void ensure()
				return () => {
					listeners.delete(callback)
					if (listeners.size === 0 && unlisten) {
						unlisten()
						unlisten = null
					}
				}
			},
		}
	}

	const overlayStateChannel = createLocalChannel<TradingOverlayState>(OVERLAY_STATE_EVENT)
	const overlayCompleteChannel = createLocalChannel<void>(OVERLAY_COMPLETE_EVENT)

	const tradingOverlay = {
		// Окно создаётся лениво Rust-командой (mirror createTradingOverlay):
		// на старте его нет — это же убирает проблемные хинты Wayland.
		open: async (): Promise<boolean> => {
			try {
				const { invoke } = await import('@tauri-apps/api/core')
				return await invoke<boolean>('trading_overlay_open')
			} catch {
				return false
			}
		},
		update: (state: TradingOverlayState): void => {
			void import('@tauri-apps/api/event')
				.then(({ emitTo }) => emitTo('overlay', OVERLAY_STATE_EVENT, state))
				.catch(() => undefined)
		},
		// Уничтожает окно (mirror closeTradingOverlay), не прячет.
		close: async (): Promise<boolean> => {
			try {
				const { invoke } = await import('@tauri-apps/api/core')
				return await invoke<boolean>('trading_overlay_close')
			} catch {
				return false
			}
		},
		// Вызывается ИЗ overlay-окна: событие уходит в main window,
		// где TradingView подписан через onComplete (аналог main.ts).
		complete: (): void => {
			void import('@tauri-apps/api/event')
				.then(({ emitTo }) => emitTo('main', OVERLAY_COMPLETE_EVENT))
				.catch(() => undefined)
		},
		onState: (callback: (state: TradingOverlayState) => void) =>
			overlayStateChannel.subscribe(callback),
		onComplete: (callback: () => void) =>
			overlayCompleteChannel.subscribe(callback),
	}

	window.stalhubDesktop = {
		platform: nodePlatform,
		beginAuth: async (url: string) => {
			await openUrl(url)
		},
		openExternal: async (url: string) => {
			await openUrl(url)
		},
		updates,
		onAuthCallback: (callback: (url: string) => void) => {
			if (typeof callback !== 'function')
				throw new TypeError('Expected callback')
			authListeners.add(callback)
			void ensureAuthSubscription().then(() =>
				notifyRenderer('auth', true)
			)
			return () => {
				authListeners.delete(callback)
				if (authListeners.size === 0) {
					if (authUnlisten) {
						authUnlisten()
						authUnlisten = null
					}
					notifyRenderer('auth', false)
				}
			}
		},
		onImport: (callback: (url: string) => void) => {
			if (typeof callback !== 'function')
				throw new TypeError('Expected callback')
			importListeners.add(callback)
			void ensureImportSubscription().then(() =>
				notifyRenderer('import', true)
			)
			return () => {
				importListeners.delete(callback)
				if (importListeners.size === 0) {
					if (importUnlisten) {
						importUnlisten()
						importUnlisten = null
					}
					notifyRenderer('import', false)
				}
			}
		},
		tradingOverlay,
	}
}
