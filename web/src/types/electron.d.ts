import type { TradingOverlayState } from '@/views/calcs/trading/trading'

export type DesktopUpdateStatus =
	| 'unsupported'
	| 'idle'
	| 'checking'
	| 'available'
	| 'downloading'
	| 'downloaded'
	| 'not-available'
	| 'error'

export type DesktopUpdateState = {
	supported: boolean
	currentVersion: string
	autoUpdate: boolean
	status: DesktopUpdateStatus
	newVersion: string | null
	percent: number | null
	error: string | null
	lastCheckedAt: number | null
}

export type DesktopUpdatesApi = {
	info(): Promise<DesktopUpdateState>
	check(): Promise<DesktopUpdateState>
	setAutoUpdate(enabled: boolean): Promise<DesktopUpdateState>
	restart(): void
	onStatus(callback: (state: DesktopUpdateState) => void): () => void
}

declare global {
	interface Window {
		stalhubDesktop?: {
			platform?: string
			beginAuth(url: string): Promise<void>
			openExternal(url: string): Promise<void>
			updates?: DesktopUpdatesApi
			onAuthCallback(callback: (url: string) => void): () => void
			tradingOverlay?: {
				open(): Promise<boolean>
				update(state: TradingOverlayState): void
				close(): Promise<boolean>
				complete(): void
				onState(
					callback: (state: TradingOverlayState) => void
				): () => void
				onComplete(callback: () => void): () => void
			}
		}
	}
}

export {}
