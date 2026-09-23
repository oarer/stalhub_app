import type {
	TauriCaptureFrame,
	TauriCaptureWindow,
} from '@/types/tauri'

// Клиент Rust-захвата экрана (Фаза 5, capture.rs). Используется только внутри
// Tauri-webview (см. useTradingCapture); на сайте и в SSR не вызывается.
export type TauriFrameSource = ImageBitmap | HTMLImageElement

export interface DecodedFrame {
	source: TauriFrameSource
	width: number
	height: number
	/** Исходные JPEG-байты (для img-превью без перекодирования). */
	bytes: Uint8Array
}

export async function captureListWindows(): Promise<TauriCaptureWindow[]> {
	const { invoke } = await import('@tauri-apps/api/core')
	return invoke<TauriCaptureWindow[]>('capture_list_windows')
}

export async function captureFindGame(): Promise<TauriCaptureWindow | null> {
	const { invoke } = await import('@tauri-apps/api/core')
	return invoke<TauriCaptureWindow | null>('capture_find_game')
}

function fromBase64(data: string): Uint8Array {
	const binary = atob(data)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i)
	}
	return bytes
}

async function decodeImage(bytes: Uint8Array): Promise<DecodedFrame> {
	const blob = new Blob([bytes as BlobPart], { type: 'image/jpeg' })
	// createImageBitmap отсутствует в старых WebKitGTK — fallback на <img>.
	if (typeof createImageBitmap === 'function') {
		try {
			const bitmap = await createImageBitmap(blob)
			return { source: bitmap, width: bitmap.width, height: bitmap.height, bytes }
		} catch {
			/* Падаем на <img> ниже. */
		}
	}
	const url = URL.createObjectURL(blob)
	try {
		const img = new Image()
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve()
			img.onerror = () => reject(new Error('Image decode failed'))
			img.src = url
		})
		return { source: img, width: img.naturalWidth, height: img.naturalHeight, bytes }
	} finally {
		URL.revokeObjectURL(url)
	}
}

/// Pull одного кадра: весь экран/окно (кроп регионов — на клиенте, как раньше).
/// windowId null — primary monitor.
export async function captureFrame(
	windowId: string | null
): Promise<DecodedFrame> {
	const { invoke } = await import('@tauri-apps/api/core')
	const frame = await invoke<TauriCaptureFrame>('capture_frame', {
		windowId,
		region: null,
		maxWidth: null,
	})
	return decodeImage(fromBase64(frame.jpegBase64))
}
