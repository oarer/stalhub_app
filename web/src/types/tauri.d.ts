// Контракт Tauri-стороны моста window.stalhubDesktop.
// JS-контракт самого моста описан в ./electron.d.ts (имя window.stalhubDesktop
// и форма API сохранены от Electron-preload, чтобы не трогать views/).
// Здесь — типы Rust-команд/событий и персистентных данных, используемых шимом
// (web/src/lib/tauri-bridge.ts). Расширяется по ходу Фаз 3–6.

/** События Rust → webview (deep-link, см. Фазу 4). */
export type TauriInboundEvent =
	| 'stalhub:auth-callback'
	| 'stalhub:import'

/** Методы Rust API-бриджа (Фаза 3, api_bridge.rs). */
export type TauriApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface TauriApiProxyArgs {
	method: TauriApiMethod
	path: string
	query?: string
	headers: Record<string, string>
	body: unknown
	timeoutMs?: number
}

export interface TauriApiProxyResult {
	status: number
	headers: Record<string, string>
	body: string
	isBase64: boolean
}

export interface TauriApiProxyResult {
	status: number
	headers: Record<string, string>
	body: string
}

/** Ключи персистентных настроек (tauri-plugin-store, Фаза 4/6). */
export interface TauriSettingsSchema {
	autoUpdate: boolean
}

/** Захват экрана (Фаза 5, capture.rs). Pull-модель: webview дёргает
 * capture_frame ~5 раз/сек, Rust отдаёт JPEG региона; OCR-конвейер
 * (canvas + tesseract.js) остаётся без изменений. */
export interface TauriCaptureWindow {
	id: string
	title: string
	app: string
}

export interface TauriCaptureRegion {
	x: number
	y: number
	width: number
	height: number
}

export interface TauriCaptureFrame {
	width: number
	height: number
	jpegBase64: string
}

export {}
