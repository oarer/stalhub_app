'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Worker } from 'tesseract.js'
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

	const setPausePreview = useCallback(
		(paused: boolean) => {
			const token = ++previewGeneration.current
			const video = videoRef.current
			if (paused) {
				// Selection must not publish OCR from an in-flight live frame.
				stop()
				video?.pause()
				updatePausePreview(true)
			} else {
				updatePausePreview(false)
				if (video?.srcObject)
					void video.play().catch(() => {
						if (token === previewGeneration.current) {
							updatePausePreview(true)
							setError('captureError')
						}
					})
			}
		},
		[stop]
	)

	const disconnect = useCallback(() => {
		sourceGeneration.current++
		previewGeneration.current++
		stop()
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
	}, [stop])

	useEffect(() => () => disconnect(), [disconnect])

	const resetSnapshot = () =>
		setSnapshot((previous) => ({
			...emptySnapshot,
			revision: previous.revision + 1,
		}))

	const selectSource = async () => {
		disconnect()
		resetSnapshot()
		setError(null)
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
			if (!video?.srcObject) throw new Error('Video unavailable')
			previewGeneration.current++
			await video.play()
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
				const video = videoRef.current
				if (
					busy ||
					!active() ||
					!video ||
					video.readyState < 2 ||
					video.paused ||
					!video.videoWidth ||
					!video.videoHeight
				)
					return
				busy = true
				try {
					// This is the only live-video read in a cycle. All crops, including
					// those recognized after an await, come from this frozen frame.
					if (frozen.width !== video.videoWidth)
						frozen.width = video.videoWidth
					if (frozen.height !== video.videoHeight)
						frozen.height = video.videoHeight
					sourceContext.drawImage(video, 0, 0)
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
