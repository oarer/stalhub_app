import axios, { AxiosError, type AxiosResponse } from 'axios'
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios'
import type {
	TauriApiMethod,
	TauriApiProxyResult,
} from '@/types/tauri'

// Axios-адаптер Tauri API-моста (Фаза 3). В webview все запросы apiClient
// идут через Rust-команду api_proxy (reqwest + cookie-jar в store) вместо
// относительных /api/* (их нет в static export).
// Не используется: на сайте, в SSR/prerender, вне Tauri (см. root.interceptor).

type WireFormField =
	| { kind: 'field'; name: string; value: string }
	| {
			kind: 'file'
			name: string
			filename: string
			contentType: string
			data: string
	  }

type WireBody =
	| { kind: 'empty' }
	| { kind: 'text'; contentType: string; data: string }
	| { kind: 'base64'; contentType: string; data: string }
	| { kind: 'form'; fields: WireFormField[] }

const PROXIED_PREFIXES = [
	'/api/v1/',
	'/uploads/',
	'/api/status',
	'/api/error-report',
]

function isProxiedPath(path: string): boolean {
	return PROXIED_PREFIXES.some(
		(prefix) => path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`)
	)
}

function toBase64(bytes: ArrayBuffer): string {
	const view = new Uint8Array(bytes)
	let binary = ''
	const CHUNK = 0x8000
	for (let i = 0; i < view.length; i += CHUNK) {
		binary += String.fromCharCode(...view.subarray(i, i + CHUNK))
	}
	return btoa(binary)
}

function fromBase64(data: string): Uint8Array {
	const binary = atob(data)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i)
	}
	return bytes
}

function headersToRecord(
	headers: InternalAxiosRequestConfig['headers']
): Record<string, string> {
	const record: Record<string, string> = {}
	const normalized = axios.AxiosHeaders.from(headers).toJSON()
	for (const [name, value] of Object.entries(normalized)) {
		if (value === undefined || value === null) continue
		record[name.toLowerCase()] = Array.isArray(value)
			? value.join(', ')
			: String(value)
	}
	return record
}

async function buildBody(
	data: unknown,
	headers: Record<string, string>
): Promise<WireBody> {
	if (data === undefined || data === null || data === '') {
		return { kind: 'empty' }
	}
	if (typeof FormData !== 'undefined' && data instanceof FormData) {
		// Content-Type с boundary соберёт reqwest; чужой заголовок сломал бы парсинг.
		delete headers['content-type']
		const fields: WireFormField[] = []
		for (const [name, value] of data.entries()) {
			if (typeof value === 'string') {
				fields.push({ kind: 'field', name, value })
			} else {
				const bytes = await value.arrayBuffer()
				fields.push({
					kind: 'file',
					name,
					filename: value.name || 'blob',
					contentType: value.type || 'application/octet-stream',
					data: toBase64(bytes),
				})
			}
		}
		return { kind: 'form', fields }
	}
	if (typeof data === 'string') {
		return {
			kind: 'text',
			contentType: headers['content-type'] || 'application/json',
			data,
		}
	}
	return {
		kind: 'text',
		contentType: headers['content-type'] || 'application/json',
		data: JSON.stringify(data),
	}
}

export const tauriApiAdapter: AxiosAdapter = async (config) => {
	const { invoke } = await import('@tauri-apps/api/core')

	// Полный URL с учётом baseURL/params/serializer, как его видит axios.
	const fullUrl = axios.getUri(config)
	let path: string
	let query: string | undefined
	try {
		const parsed = new URL(fullUrl, 'http://localhost')
		path = parsed.pathname
		const search = parsed.search.startsWith('?')
			? parsed.search.slice(1)
			: parsed.search
		query = search || undefined
	} catch {
		throw new AxiosError(
			`Tauri bridge: invalid URL ${fullUrl}`,
			'ERR_BAD_REQUEST',
			config
		)
	}
	if (!isProxiedPath(path)) {
		throw new AxiosError(
			`Tauri bridge: path not proxied: ${path}`,
			'ERR_BAD_REQUEST',
			config
		)
	}

	const headers = headersToRecord(config.headers)
	// Куками владеет Rust-jar; заголовки транспорта выставит reqwest.
	delete headers['cookie']
	delete headers['host']
	delete headers['content-length']
	delete headers['connection']

	const body = await buildBody(config.data, headers)
	const timeout =
		typeof config.timeout === 'number' && config.timeout > 0
			? config.timeout
			: undefined

	let result: TauriApiProxyResult
	try {
		result = await invoke<TauriApiProxyResult>('api_proxy', {
			method: (config.method || 'get').toUpperCase() as TauriApiMethod,
			path,
			query,
			headers,
			body,
			timeoutMs: timeout,
		})
	} catch (error: unknown) {
		throw new AxiosError(
			error instanceof Error ? error.message : String(error),
			'ERR_NETWORK',
			config
		)
	}

	let data: unknown = result.body
	if (result.isBase64) {
		const bytes = fromBase64(result.body)
		if (config.responseType === 'arraybuffer') {
			data = bytes.buffer as ArrayBuffer
		} else {
			data = new TextDecoder().decode(bytes)
		}
	}

	const response: AxiosResponse = {
		data,
		status: result.status,
		statusText: '',
		headers: result.headers,
		config,
	}

	const validateStatus =
		config.validateStatus || ((status: number) => status >= 200 && status < 300)
	if (!validateStatus(response.status)) {
		throw new AxiosError(
			`Request failed with status code ${response.status}`,
			'ERR_BAD_RESPONSE',
			config,
			undefined,
			response
		)
	}
	return response
}
