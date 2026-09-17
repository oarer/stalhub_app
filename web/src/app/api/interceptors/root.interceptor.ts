import axios from 'axios'
import { useBanStore } from '@/stores/useBan.store'

declare module 'axios' {
	interface AxiosRequestConfig {
		skipAuthRefresh?: boolean
	}
}

const isAuthRoute = () =>
	typeof window !== 'undefined' &&
	window.location.pathname.startsWith('/auth')

const isServerRequest = () => typeof window === 'undefined'

export const apiClient = axios.create({
	baseURL: typeof window === 'undefined'
		? (process.env.API_ORIGIN || 'http://localhost:3001')
		: process.env.NEXT_PUBLIC_API,
	timeout: 10_000,
	headers: {
		'Content-Type': 'application/json',
	},
	withCredentials: true,
})

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

		// Some /me probes are intentionally unauthenticated. They must not start
		// refresh: the refresh token is HttpOnly and cannot be checked in JS.
		if (originalRequest.skipAuthRefresh || isAuthRoute() || isServerRequest()) {
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
			await apiClient.post('/api/v1/auth/refresh')
			processQueue()

			return apiClient(originalRequest)
		} catch (refreshError) {
			// Older backends validate the required HttpOnly cookie before entering
			// refresh. Preserve the original 401 only for that exact missing-cookie case.
			const missingRefreshCookie = axios.isAxiosError(refreshError)
				&& refreshError.response?.status === 422
				&& refreshError.response.data?.type === 'validation'
				&& refreshError.response.data?.on === 'cookie'
				&& !refreshError.response.data?.found?.refresh_token
			const sessionError = missingRefreshCookie ? error : refreshError
			processQueue(sessionError)

			return Promise.reject(sessionError)
		} finally {
			isRefreshing = false
		}
	}
)
