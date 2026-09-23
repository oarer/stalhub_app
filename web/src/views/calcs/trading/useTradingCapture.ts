'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Worker } from 'tesseract.js'
import { isTauri } from '@/lib/tauri-bridge'
import {
	captureFindGame,
	captureFrame,
	captureListWindows,
} from '@/lib/tauri-capture'
import type { TauriCaptureWindow } from '@/types/tauri'
import { sameFrame } from './frame'
import type { Selection } from './trading'

type CaptureExtras = { player?: Selection | null; status?: Selection | null }
type CaptureSnapshot = {
	text: string
	playerText: string
	statusText: string
	frame: number
	revision: number
}
const emptySnapshot: CaptureSnapshot = {
	text: '',
	playerText: '',
	statusText: '',
	frame: 0,
	revision: 0,
}

export type TradingCapture = ReturnType<typeof useTradingCapture>

export function useTradingCapture() {
	const videoRef = useRef<HTMLVideoElement>(null)
	const streamRef = useRef<MediaStream | null>(null)
	const workerRef = useRef<Worker | null>(null)
	const generation = useRef(0)
	const sourceGeneration = useRef(0)
	const previewGeneration = useRef(0)
	const removeEndedListener = useRef<(() => void) | null>(null)
	const timer = useRef<ReturnType<typeof setInterval> | null>(null)
	// Tauri-режим (Rust pull-кадры вместо getDisplayMedia-потока).
	const tauriMode = isTauri()
	const tauriSource = useRef<{ windowId: string | null } | null>(null)
	const tauriFrame = useRef<{
		source: ImageBitmap | HTMLImageElement
		width: number
		height: number
	} | null>(null)
	const pullTimer = useRef<ReturnType<typeof setInterval> | null>(null)
	const pullBusy = useRef(false)
	const previewUrlRef = useRef<string | null>(null)
	const [previewUrl, setPreviewUrlState] = useState<string | null>(null)
	const [sources, setSources] = useState<TauriCaptureWindow[]>([])
	const [sourceId, setSourceId] = useState<string | null>(null)
	const [connected, setConnected] = useState(false)
	const [selecting, setSelecting] = useState(false)
	const [pausePreview, updatePausePreview] = useState(false)
	const [status, setStatus] = useState<'idle' | 'preparing' | 'running'>(
		'idle'
	)
	const [error, setError] = useState<string | null>(null)
	const [snapshot, setSnapshot] = useState<CaptureSnapshot>(emptySnapshot)
	const [progress, setProgress] = useState(0)
	const [duration, setDuration] = useState<number | null>(null)
	const [skipped, setSkipped] = useState(0)

	const stop = useCallback(() => {
		generation.current++
		if (timer.current) clearInterval(timer.current)
		timer.current = null
		const worker = workerRef.current
		workerRef.current = null
		if (worker)
			void worker.terminate().catch(() => {
				/* Worker may already have exited. */
			})
		setStatus('idle')
	}, [])

	const setPreviewUrl = useCallback((url: string | null) => {
		const previous = previewUrlRef.current
		previewUrlRef.current = url
		if (previous) URL.revokeObjectURL(previous)
		setPreviewUrlState(url)
	}, [])

	const stopPullLoop = useCallback(() => {
		if (pullTimer.current) clearInterval(pullTimer.current)
		pullTimer.current = null
		pullBusy.current = false
	}, [])

	// Pull-цикл Rust-кадров (Tauri): кормит frozen-canvas OCR и img-превью.
	// Один цикл на подключение — и для выбора регионов, и для распознавания.
	const startPullLoop = useCallback(() => {
		if (pullTimer.current) return
		const token = sourceGeneration.current
		const pull = async () => {
			if (token !== sourceGeneration.current) {
				stopPullLoop()
				return
			}
			const source = tauriSource.current
			if (!source || pullBusy.current) return
			pullBusy.current = true
			try {
				const frame = await captureFrame(source.windowId)
				if (token !== sourceGeneration.current) return
				tauriFrame.current = frame
				const url = URL.createObjectURL(
					new Blob([frame.bytes as BlobPart], { type: 'image/jpeg' })
				)
				if (token !== sourceGeneration.current) {
					URL.revokeObjectURL(url)
					return
				}
				setPreviewUrl(url)
			} catch {
				/* Следующий тик повторит; фатальные ошибки — в start/select. */
			} finally {
				pullBusy.current = false
			}
		}
		pullTimer.current = setInterval(() => {
			void pull()
		}, 200)
		void pull()
	}, [setPreviewUrl, stopPullLoop])

	const setPausePreview = useCallback(
		(paused: boolean) => {
			const token = ++previewGeneration.current
			const video = videoRef.current
			if (paused) {
				// Selection must not publish OCR from an in-flight live frame.
				stop()
				if (!tauriMode) video?.pause()
				updatePausePreview(true)
			} else {
				updatePausePreview(false)
				if (!tauriMode && video?.srcObject)
					void video.play().catch(() => {
						if (token === previewGeneration.current) {
							updatePausePreview(true)
							setError('captureError')
						}
					})
			}
		},
		[stop, tauriMode]
	)

	const disconnect = useCallback(() => {
		sourceGeneration.current++
		previewGeneration.current++
		stop()
		stopPullLoop()
		tauriSource.current = null
		tauriFrame.current = null
		setPreviewUrl(null)
		setSources([])
		setSourceId(null)
		removeEndedListener.current?.()
		removeEndedListener.current = null
		for (const track of streamRef.current?.getTracks() ?? []) track.stop()
		streamRef.current = null
		if (videoRef.current) {
			videoRef.current.pause()
			videoRef.current.srcObject = null
		}
		updatePausePreview(false)
		setConnected(false)
		setSelecting(false)
	}, [stop, stopPullLoop, setPreviewUrl])

	useEffect(() => () => disconnect(), [disconnect])

	const resetSnapshot = useCallback(
		() =>
			setSnapshot((previous) => ({
				...emptySnapshot,
				revision: previous.revision + 1,
			})),
		[]
	)

	const selectSource = async () => {
		disconnect()
		resetSnapshot()
		setError(null)
		if (tauriMode) {
			await selectSourceTauri()
			return
		}
		if (!navigator.mediaDevices?.getDisplayMedia) {
			setError('unsupported')
			return
		}
		const token = sourceGeneration.current
		setSelecting(true)
		let stream: MediaStream | null = null
		try {
			stream = await navigator.mediaDevices.getDisplayMedia({
				video: true,
				audio: false,
			})
			if (token !== sourceGeneration.current || !videoRef.current) {
				stream.getTracks().forEach((track) => track.stop())
				return
			}
			streamRef.current = stream
			const track = stream.getVideoTracks()[0]
			if (!track) throw new Error('Video track unavailable')
			const onEnded = () => {
				if (token === sourceGeneration.current) disconnect()
			}
			track.addEventListener('ended', onEnded, { once: true })
			removeEndedListener.current = () =>
				track.removeEventListener('ended', onEnded)
			videoRef.current.srcObject = stream
			await videoRef.current.play()
			if (token === sourceGeneration.current) setConnected(true)
		} catch {
			stream?.getTracks().forEach((track) => track.stop())
			if (token === sourceGeneration.current) {
				disconnect()
				setError('captureError')
			}
		} finally {
			if (token === sourceGeneration.current) setSelecting(false)
		}
	}

	// Tauri: источник — окно из Rust (автовыбор игры) или primary monitor.
	// Потока getDisplayMedia во webview нет — кадры тянет pull-цикл.
	const selectSourceTauri = async () => {
		const token = sourceGeneration.current
		setSelecting(true)
		try {
			const windows = await captureListWindows()
			if (token !== sourceGeneration.current) return
			setSources(windows)
			const game = await captureFindGame().catch(() => null)
			if (token !== sourceGeneration.current) return
			// Окно игры либо primary monitor (windowId null).
			const windowId = game?.id ?? null
			tauriSource.current = { windowId }
			setSourceId(windowId)
			startPullLoop()
			if (token !== sourceGeneration.current) return
			setConnected(true)
		} catch {
			if (token !== sourceGeneration.current) return
			disconnect()
			setError('captureError')
		} finally {
			if (token === sourceGeneration.current) setSelecting(false)
		}
	}

	// Ручной выбор окна (Tauri). Pull-цикл подхватывает новый id со следующего
	// тика; текущий кадр сбрасываем, чтобы OCR не ел stale-пиксели.
	const selectWindow = useCallback(
		(windowId: string | null) => {
			if (!tauriMode || !tauriSource.current) return
			tauriSource.current = { windowId }
			tauriFrame.current = null
			setSourceId(windowId)
			resetSnapshot()
		},
		[tauriMode, resetSnapshot]
	)

	const start = async (
		region: Selection,
		language: string,
		upscale = true,
		extras: CaptureExtras = {}
	) => {
		stop()
		setDuration(null)
		setSkipped(0)
		const token = generation.current
		setError(null)
		resetSnapshot()
		setProgress(0)
		setStatus('preparing')
		const active = () => token === generation.current
		// Copy coordinates so callers cannot mutate an active capture session.
		const regions = [region, extras.player, extras.status].map((value) =>
			value ? { ...value } : null
		)
		try {
			const video = videoRef.current
			if (tauriMode) {
				// Pull-цикл крутится с selectSource, но первого кадра могло
				// не быть — дотягиваем синхронно перед запуском OCR.
				const source = tauriSource.current
				if (!source) throw new Error('Video unavailable')
				if (!tauriFrame.current) {
					tauriFrame.current = await captureFrame(source.windowId)
				}
			} else if (!video?.srcObject) {
				throw new Error('Video unavailable')
			}
			previewGeneration.current++
			if (!tauriMode && video) {
				await video.play()
			}
			if (!active()) return
			updatePausePreview(false)
			const { createWorker, PSM } = await import('tesseract.js')
			if (!active()) return
			const worker = await createWorker(language, 1, {
				workerPath: '/ocr/worker.min.js',
				corePath: '/ocr',
				logger: ({ progress: value }) => {
					if (active()) setProgress(Math.round(value * 100))
				},
				errorHandler: () => {
					if (active()) {
						stop()
						setError('failed')
					}
				},
			})
			if (!active()) {
				await worker.terminate()
				return
			}
			workerRef.current = worker
			await worker.setParameters({ preserve_interword_spaces: '1' })
			if (!active()) return
			const frozen = document.createElement('canvas')
			const sourceContext = frozen.getContext('2d')
			if (!sourceContext) throw new Error('Canvas unavailable')
			const caches = regions.map((selection) => {
				const canvas = document.createElement('canvas')
				const context = canvas.getContext('2d', {
					willReadFrequently: true,
				})
				if (!context) throw new Error('Canvas unavailable')
				return {
					selection,
					canvas,
					context,
					pixels: null as Uint8ClampedArray | null,
					text: '',
				}
			})
			setStatus('running')
			let busy = false
			const recognize = async () => {
				if (busy || !active()) return
				busy = true
				try {
					if (tauriMode) {
						// Rust-кадр (уже декодирован pull-циклом) вместо video.
						const frame = tauriFrame.current
						if (!frame) return
						if (frozen.width !== frame.width)
							frozen.width = frame.width
						if (frozen.height !== frame.height)
							frozen.height = frame.height
						sourceContext.drawImage(frame.source, 0, 0)
					} else {
						const video = videoRef.current
						if (
							!video ||
							video.readyState < 2 ||
							video.paused ||
							!video.videoWidth ||
							!video.videoHeight
						)
							return
						// This is the only live-video read in a cycle. All crops, including
						// those recognized after an await, come from this frozen frame.
						if (frozen.width !== video.videoWidth)
							frozen.width = video.videoWidth
						if (frozen.height !== video.videoHeight)
							frozen.height = video.videoHeight
						sourceContext.drawImage(video, 0, 0)
					}
					const started = performance.now()
					let changed = false
					for (const [index, cache] of caches.entries()) {
						const { selection, canvas, context } = cache
						if (!selection) continue
						const x = Math.floor(selection.x * frozen.width)
						const y = Math.floor(selection.y * frozen.height)
						const width = Math.max(
							1,
							Math.floor(selection.width * frozen.width)
						)
						const height = Math.max(
							1,
							Math.floor(selection.height * frozen.height)
						)
						const scale = Math.min(
							upscale ? 2 : 1,
							2560 / width,
							2560 / height
						)
						const targetWidth = Math.max(
							1,
							Math.round(width * scale)
						)
						const targetHeight = Math.max(
							1,
							Math.round(height * scale)
						)
						if (
							canvas.width !== targetWidth ||
							canvas.height !== targetHeight
						) {
							canvas.width = targetWidth
							canvas.height = targetHeight
							cache.pixels = null
						}
						context.clearRect(0, 0, canvas.width, canvas.height)
						context.drawImage(
							frozen,
							x,
							y,
							width,
							height,
							0,
							0,
							canvas.width,
							canvas.height
						)
						const pixels = context.getImageData(
							0,
							0,
							canvas.width,
							canvas.height
						).data
						if (sameFrame(cache.pixels, pixels)) continue
						await worker.setParameters({
							tessedit_pageseg_mode:
								index === 0
									? PSM.SINGLE_BLOCK
									: PSM.SINGLE_LINE,
						})
						if (!active()) return
						const result = await worker.recognize(canvas)
						if (!active()) return
						cache.pixels = pixels
						cache.text = result.data.text
						changed = true
					}
					if (!active()) return
					if (!changed) {
						setSkipped((value) => value + 1)
						return
					}
					setDuration(Math.round(performance.now() - started))
					// One state update publishes the complete tuple, never individual
					// OCR results mixed with values from an earlier live frame.
					setSnapshot((previous) => ({
						text: caches[0].text,
						playerText: caches[1].text,
						statusText: caches[2].text,
						frame: previous.frame + 1,
						revision: previous.revision + 1,
					}))
				} catch {
					if (active()) {
						stop()
						setError('failed')
					}
				} finally {
					busy = false
				}
			}
			timer.current = setInterval(() => {
				void recognize()
			}, 200)
			void recognize()
		} catch {
			if (active()) {
				stop()
				setError('failed')
			}
		}
	}

	return {
		videoRef,
		previewUrl,
		sources,
		sourceId,
		selectWindow,
		connected,
		selecting,
		status,
		error,
		...snapshot,
		progress,
		duration,
		skipped,
		pausePreview,
		setPausePreview,
		selectSource,
		start,
		stop,
		disconnect,
	}
}
