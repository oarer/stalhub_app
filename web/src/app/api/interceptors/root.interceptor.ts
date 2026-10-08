import axios from 'axios'
import { useAuthStore } from '@/stores/useAuth.store'
import { useBanStore } from '@/stores/useBan.store'
import { tauriApiAdapter } from '@/lib/tauri-api-adapter'
import { isTauri } from '@/lib/tauri-bridge'

declare module 'axios' {
	interface AxiosRequestConfig {
		skipAuthRefresh?: boolean
		allowAuthRefresh?: boolean
	}
}

const isAuthRoute = () =>
	typeof window !== 'undefined' &&
	window.location.pathname.startsWith('/auth')

const isServerRequest = () => typeof window === 'undefined'

export const apiClient = axios.create({
	baseURL:
		typeof window === 'undefined'
			? process.env.STALHUB_API_ORIGIN ||
				process.env.API_ORIGIN ||
				process.env.NEXT_PUBLIC_API ||
				'https://api.stalhub.dev'
			: '',
	timeout: 10_000,
	headers: {
		'Content-Type': 'application/json',
	},
	withCredentials: true,
})

// Десктоп (Tauri, static export): относительных /api/* в webview нет —
// все запросы идут через Rust API-мост (Фаза 3, api_bridge.rs: reqwest +
// cookie-jar в store). На сайте, в SSR и вне Tauri — обычный adapter.
if (isTauri()) {
	apiClient.defaults.adapter = tauriApiAdapter
}

let isRefreshing = false

let failedQueue: Array<{
	resolve: () => void
	reject: (reason?: unknown) => void
}> = []

const processQueue = (error?: unknown) => {
	failedQueue.forEach(({ resolve, reject }) => {
		if (error) {
			reject(error)
		} else {
			resolve()
		}
	})

	failedQueue = []
}

apiClient.interceptors.response.use(
	(response) => response,

	async (error) => {
		const originalRequest = error.config

		if (
			error.response?.status === 403 &&
			error.response?.data?.error === 'Account banned'
		) {
			useBanStore
				.getState()
				.setBanned(
					true,
					error.response?.data?.reason,
					error.response?.data?.expire_in
				)

			return Promise.reject(error)
		}

		if (error.response?.status !== 401) {
			return Promise.reject(error)
		}

		if (originalRequest.url?.includes('/api/v1/auth/refresh')) {
			return Promise.reject(error)
		}

		if (originalRequest._retry) {
			return Promise.reject(error)
		}

		// На сервере (SSR-префетчи) браузерные HttpOnly-куки недоступны,
		// поэтому refresh заведомо не может успеть: отдаём исходный 401,
		// а не сбивающий с толку 422 от /refresh без кук.
		if (isServerRequest()) {
			return Promise.reject(error)
		}

		// Some /me probes are intentionally unauthenticated. They must not start
		// refresh: the refresh token is HttpOnly and cannot be checked in JS.
		// Requests from /auth never refresh either, except ones that opt in via
		// allowAuthRefresh (e.g. desktop/issue needs a live session to hand off).
		if (
			originalRequest.skipAuthRefresh ||
			(isAuthRoute() && !originalRequest.allowAuthRefresh)
		) {
			return Promise.reject(error)
		}

		if (isRefreshing) {
			return new Promise<void>((resolve, reject) => {
				failedQueue.push({
					resolve,
					reject,
				})
			}).then(() => {
				return apiClient(originalRequest)
			})
		}

		originalRequest._retry = true
		isRefreshing = true

		try {
			await apiClient.post('/api/v1/auth/refresh', undefined, {
				skipAuthRefresh: true,
			})
			processQueue()

			return apiClient(originalRequest)
		} catch (refreshError) {
			processQueue(refreshError)

			// Сессию восстановить не удалось — больше не считаем
			// пользователя залогиненным, чтобы UI не врал.
			useAuthStore.getState().setUser(null)

			return Promise.reject(refreshError)
		} finally {
			isRefreshing = false
		}
	}
)
