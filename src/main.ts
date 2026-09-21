import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import {
	app,
	BrowserWindow,
	desktopCapturer,
	dialog,
	ipcMain,
	shell,
	type UtilityProcess,
	utilityProcess,
} from 'electron'
import started from 'electron-squirrel-startup'
import { autoUpdater } from 'electron-updater'
import { findGameWindow } from './game-window'


let window: BrowserWindow | null = null
let server: UtilityProcess | undefined
let origin = ''
let capabilityToken = ''
let rendererReady = false
let quitting = false
let overlayWindow: BrowserWindow | null = null
let lastOverlayState: unknown = null
const pending: string[] = []

type UpdateStatus =
	| 'unsupported'
	| 'idle'
	| 'checking'
	| 'available'
	| 'downloading'
	| 'downloaded'
	| 'not-available'
	| 'error'

type UpdateState = {
	supported: boolean
	currentVersion: string
	autoUpdate: boolean
	status: UpdateStatus
	newVersion: string | null
	percent: number | null
	error: string | null
	lastCheckedAt: number | null
}

let updateState: UpdateState = {
	supported: false,
	currentVersion: app.getVersion(),
	autoUpdate: true,
	status: 'unsupported',
	newVersion: null,
	percent: null,
	error: null,
	lastCheckedAt: null,
}
let checkingUpdate = false

function updateSettingsFile(): string {
	return path.join(app.getPath('userData'), 'update-settings.json')
}

function readAutoUpdateSetting(): boolean {
	try {
		const value = JSON.parse(fs.readFileSync(updateSettingsFile(), 'utf8'))
		if (value && typeof value.autoUpdate === 'boolean')
			return value.autoUpdate
	} catch {
		/* First run. */
	}
	return true
}

function writeAutoUpdateSetting(autoUpdate: boolean) {
	try {
		fs.writeFileSync(updateSettingsFile(), JSON.stringify({ autoUpdate }), {
			mode: 0o600,
		})
	} catch {
		/* Non-fatal: the toggle reverts on the next launch. */
	}
}

function updatesSupported(): boolean {
	return (
		app.isPackaged &&
		process.env.STALHUB_SKIP_UPDATES !== 'true' &&
		process.platform === 'win32' &&
		fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))
	)
}

function broadcastUpdateStatus() {
	if (!window || window.isDestroyed()) return
	window.webContents.send('stalhub:updates:status', updateState)
}

function setUpdateStatus(patch: Partial<UpdateState>) {
	updateState = { ...updateState, ...patch }
	broadcastUpdateStatus()
}

async function promptRestart(version: string) {
	if (!window || window.isDestroyed()) return
	const result = await dialog.showMessageBox(window, {
		type: 'info',
		buttons: ['Restart now', 'Later'],
		defaultId: 0,
		cancelId: 1,
		title: 'Stalhub update',
		message: `A new version (${version}) is ready to install.`,
	})
	if (result.response === 0) autoUpdater.quitAndInstall()
}

function configureAutoUpdates() {
	updateState = {
		supported: updatesSupported(),
		currentVersion: app.getVersion(),
		autoUpdate: readAutoUpdateSetting(),
		status: updatesSupported() ? 'idle' : 'unsupported',
		newVersion: null,
		percent: null,
		error: null,
		lastCheckedAt: null,
	}
	if (!updateState.supported) return
	autoUpdater.autoDownload = true
	autoUpdater.autoInstallOnAppQuit = true
	autoUpdater.on('checking-for-update', () =>
		setUpdateStatus({ status: 'checking', error: null })
	)
	autoUpdater.on('update-available', (info) =>
		setUpdateStatus({ status: 'available', newVersion: info.version })
	)
	autoUpdater.on('update-not-available', () =>
		setUpdateStatus({
			status: 'not-available',
			lastCheckedAt: Date.now(),
		})
	)
	autoUpdater.on('download-progress', (progress) =>
		setUpdateStatus({ status: 'downloading', percent: progress.percent })
	)
	autoUpdater.on('update-downloaded', (info) => {
		setUpdateStatus({
			status: 'downloaded',
			newVersion: info.version,
			percent: 100,
			lastCheckedAt: Date.now(),
		})
		void promptRestart(info.version)
	})
	autoUpdater.on('error', (error: unknown) =>
		setUpdateStatus({
			status: 'error',
			error: error instanceof Error ? error.message : String(error),
		})
	)
	if (updateState.autoUpdate) {
		checkingUpdate = true
		autoUpdater
			.checkForUpdatesAndNotify()
			.catch(() => {
				// Updates are optional; a failed check must not prevent app startup.
			})
			.finally(() => {
				checkingUpdate = false
			})
	}
}

function callbackUrl(value: unknown): string | null {
	if (typeof value !== 'string' || value.length > 8192) return null
	try {
		const url = new URL(value)
		return url.protocol === 'stalhub:' &&
			url.hostname === 'auth' &&
			url.pathname === '/callback' &&
			!url.username &&
			!url.password &&
			!url.port &&
			!url.hash
			? url.href
			: null
	} catch {
		return null
	}
}
function externalUrl(value: unknown): string {
	if (typeof value !== 'string' || value.length > 8192)
		throw new Error('Invalid external URL')
	const url = new URL(value)
	if (url.username || url.password)
		throw new Error('Credentials in external URLs are forbidden')
	if (url.protocol === 'https:' || url.protocol === 'http:') return url.href
	throw new Error('Only web external URLs are permitted')
}
function isLocal(value: string): boolean {
	try {
		return new URL(value).origin === origin
	} catch {
		return false
	}
}
function focusWindow() {
	if (!window) return
	if (window.isMinimized()) window.restore()
	window.show()
	window.focus()
}
function flushCallbacks() {
	if (!rendererReady || !window || window.webContents.isDestroyed()) return
	while (pending.length)
		window.webContents.send('stalhub:auth-callback', pending.shift())
}
function acceptCallback(value: unknown) {
	const url = callbackUrl(value)
	if (!url) return
	if (!pending.includes(url)) {
		if (pending.length >= 16) pending.shift()
		pending.push(url)
	}
	focusWindow()
	flushCallbacks()
}
function trustedSender(
	event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent
): boolean {
	return (
		!!window &&
		event.sender === window.webContents &&
		event.senderFrame === window.webContents.mainFrame &&
		isLocal(event.senderFrame.url)
	)
}
function trustedOverlaySender(
	event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent
): boolean {
	return (
		!!overlayWindow &&
		!overlayWindow.isDestroyed() &&
		event.sender === overlayWindow.webContents &&
		event.senderFrame === overlayWindow.webContents.mainFrame &&
		isLocal(event.senderFrame.url)
	)
}
function sendOverlayState() {
	if (
		!overlayWindow ||
		overlayWindow.isDestroyed() ||
		lastOverlayState === null
	)
		return
	overlayWindow.webContents.send(
		'stalhub:trading-overlay:state',
		lastOverlayState
	)
}
function closeTradingOverlay() {
	const win = overlayWindow
	overlayWindow = null
	lastOverlayState = null
	if (win && !win.isDestroyed()) win.close()
}
function createTradingOverlay(): boolean {
	if (overlayWindow && !overlayWindow.isDestroyed()) {
		overlayWindow.show()
		overlayWindow.focus()
		return true
	}
	const win = new BrowserWindow({
		title: 'Stalhub Trading',
		width: 420,
		height: 640,
		minWidth: 320,
		minHeight: 480,
		maxWidth: 520,
		maxHeight: 900,
		show: false,
		frame: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		resizable: true,
		backgroundColor: '#09090b',
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
			webSecurity: true,
			allowRunningInsecureContent: false,
			webviewTag: false,
		},
	})
	overlayWindow = win
	// Keep the overlay above fullscreen game windows across platforms.
	win.setAlwaysOnTop(true, 'screen-saver')
	win.webContents.on('will-navigate', (event, url) => {
		if (isLocal(url)) return
		event.preventDefault()
		try {
			void shell.openExternal(externalUrl(url)).catch(console.error)
		} catch {
			/* Deny unsafe schemes. */
		}
	})
	win.webContents.setWindowOpenHandler(({ url }) => {
		if (isLocal(url)) {
			if (url === `${origin}/calcs/trading/overlay`) {
				win.show()
				win.focus()
				return { action: 'deny' }
			}
			void win.loadURL(url)
			return { action: 'deny' }
		}
		try {
			void shell.openExternal(externalUrl(url)).catch(console.error)
		} catch {
			/* Deny unsafe schemes. */
		}
		return { action: 'deny' }
	})
	// The main window may publish state before the overlay finished loading;
	// replay the latest snapshot once the renderer is ready.
	win.webContents.on('did-finish-load', () => sendOverlayState())
	win.on('closed', () => {
		if (overlayWindow === win) overlayWindow = null
	})
	win.once('ready-to-show', () => win.show())
	void win.loadURL(`${origin}/calcs/trading/overlay`)
	return true
}
function waitForHttp(
	url: string,
	deadline: number,
	{ serverRequired = true }: { serverRequired?: boolean } = {}
): Promise<void> {
	return new Promise((resolve, reject) => {
		let lastError = ''
		const retry = () => {
			if (quitting || Date.now() >= deadline) {
				reject(
					new Error(
						`Local web server did not become ready${lastError ? `: ${lastError}` : ''}`
					)
				)
				return
			}
			setTimeout(
				() =>
					waitForHttp(url, deadline, { serverRequired }).then(
						resolve,
						reject
					),
				150
			)
		}
		const request = http.get(
			url,
			{ headers: { 'x-stalhub-capability': capabilityToken } },
			(response) => {
				if (response.statusCode && response.statusCode < 600) {
					resolve()
					return
				}
				lastError = `HTTP ${response.statusCode ?? 'unknown'}`
				response.resume()
				retry()
			}
		)
		request.setTimeout(2000, () => {
			lastError = 'readiness request timed out'
			request.destroy()
		})
		request.once('error', (error) => {
			lastError = error.message
			retry()
		})
	})
}
async function startServer(): Promise<string> {
	// Dev mode: load the Next.js dev server (HMR) instead of the staged
	// standalone production runtime. The dev script (npm run dev) starts it.
	const devUrl = process.env.STALHUB_WEB_DEV_URL
	if (devUrl) {
		await waitForHttp(devUrl, Date.now() + 45000, { serverRequired: false })
		return devUrl
	}
	return startStandaloneServer()
}
function runtimeRoot() {
	const candidates = app.isPackaged
		? [
				path.join(process.resourcesPath, 'runtime', 'web'),
				path.join(process.resourcesPath, 'web'),
			]
		: [path.join(app.getAppPath(), 'runtime', 'web')]
	const root = candidates.find((candidate) =>
		fs.existsSync(path.join(candidate, 'server.js'))
	)
	if (!root) {
		throw new Error(
			`Missing bundled web runtime. Checked: ${candidates.join(', ')}`
		)
	}
	return root
}

async function startStandaloneServer(): Promise<string> {
	const root = runtimeRoot()
	const portFile = path.join(
		app.getPath('userData'),
		'local-server-port.json'
	)
	let savedPort = 0
	try {
		const value = JSON.parse(fs.readFileSync(portFile, 'utf8'))
		if (Number.isInteger(value) && value >= 1024 && value <= 65535)
			savedPort = value
	} catch {
		/* First launch. */
	}
	const childEnv: Record<string, string | undefined> = {
		...process.env,
		STALHUB_CAPABILITY: capabilityToken,
		NODE_ENV: 'production',
		HOSTNAME: '127.0.0.1',
		PORT: '0',
	}
	// The renderer API client proxies /api/v1/* to STALHUB_API_ORIGIN. In dev the
	// sane default is the locally running backend; packaged builds hit the prod API.
	childEnv.STALHUB_API_ORIGIN =
		childEnv.STALHUB_API_ORIGIN ||
		(app.isPackaged ? 'https://api.stalhub.dev' : 'http://localhost:3001')
	const child = utilityProcess.fork(
		path.join(__dirname, 'server.js'),
		[root, String(savedPort)],
		{
			cwd: root,
			env: childEnv,
			stdio: 'pipe',
			serviceName: 'Stalhub local web server',
		}
	)
	let childOutput = ''
	const appendOutput = (chunk: unknown) => {
		childOutput = `${childOutput}${String(chunk)}`.slice(-12000)
	}
	server = child
	child.stdout?.on('data', (chunk) => {
		appendOutput(chunk)
		console.log('[web]', String(chunk).trimEnd())
	})
	child.stderr?.on('data', (chunk) => {
		appendOutput(chunk)
		console.error('[web]', String(chunk).trimEnd())
	})
	child.on('exit', (code) => {
		if (server === child) server = undefined
		if (origin && !quitting) {
			dialog.showErrorBox(
				'Stalhub server stopped',
				`The local web server exited (${code}). Please restart Stalhub.`
			)
			app.quit()
		}
	})
	const port = await new Promise<number>((resolve, reject) => {
		const timeout = setTimeout(() => {
			child.kill()
			reject(new Error('Local server startup timed out'))
		}, 45000)
		child.once('exit', (code) => {
			clearTimeout(timeout)
			reject(
				new Error(
					`Local server exited (${code})${childOutput ? `: ${childOutput.trim()}` : ''}`
				)
			)
		})
		child.on(
			'message',
			(message: { type?: string; port?: number; message?: string }) => {
				if (message?.type === 'error') {
					clearTimeout(timeout)
					reject(new Error(message.message || 'Local server error'))
				}
				if (
					message?.type === 'listening' &&
					typeof message.port === 'number' &&
					Number.isInteger(message.port) &&
					message.port > 0 &&
					message.port <= 65535
				) {
					clearTimeout(timeout)
					resolve(message.port)
				}
			}
		)
	})
	fs.mkdirSync(path.dirname(portFile), { recursive: true })
	fs.writeFileSync(portFile, JSON.stringify(port), { mode: 0o600 })
	const url = `http://127.0.0.1:${port}`
	await waitForHttp(`${url}/api/health`, Date.now() + 45000)
	return url
}
async function createWindow() {
	if (window) {
		focusWindow()
		return
	}
	window = new BrowserWindow({
		title: 'Stalhub',
		width: 1440,
		height: 960,
		minWidth: 900,
		minHeight: 640,
		show: false,
		backgroundColor: '#09090b',
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
			webSecurity: true,
			allowRunningInsecureContent: false,
			webviewTag: false,
		},
	})
	const current = window
	const osLabel =
		(
			{ win32: 'Windows', darwin: 'macOS', linux: 'Linux' } as Record<
				string,
				string
			>
		)[process.platform] ?? process.platform
	current.webContents.setUserAgent(
		`StalHubApp_${osLabel} ${current.webContents.userAgent}`
	)
	current.webContents.session.webRequest.onBeforeSendHeaders(
		(details, callback) => {
			const headers = details.requestHeaders
			for (const name of Object.keys(headers)) {
				if (name.toLowerCase() === 'x-stalhub-capability')
					delete headers[name]
			}
			if (isLocal(details.url))
				headers['x-stalhub-capability'] = capabilityToken
			callback({ requestHeaders: headers })
		}
	)
	current.webContents.session.webRequest.onHeadersReceived(
		(details, callback) => {
			const headers = details.responseHeaders || {}
			if (isLocal(details.url)) {
				headers['Content-Security-Policy'] = [
					"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://telegram.org https://oauth.telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' https: data:; connect-src 'self' https:; worker-src 'self' blob:; media-src 'self' https: blob: data:; frame-src https://oauth.telegram.org https://www.youtube.com https://www.youtube-nocookie.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
				]
				headers['X-Content-Type-Options'] = ['nosniff']
			}
			callback({ responseHeaders: headers })
		}
	)
	const isTradingPage = (url: string): boolean => {
		if (!isLocal(url)) return false
		return new URL(url).pathname === '/calcs/trading'
	}
	const trustedTradingContents = (contents: Electron.WebContents | null) =>
		!current.isDestroyed() &&
		!current.webContents.isDestroyed() &&
		contents === current.webContents &&
		isTradingPage(contents.getURL())
	current.webContents.session.setPermissionRequestHandler(
		(contents, permission, callback, details) =>
			callback(
				contents === current.webContents &&
					isLocal(contents.getURL()) &&
					(permission === 'clipboard-sanitized-write' ||
						permission === 'notifications' ||
						// Electron routes getDisplayMedia through "media" with no device types.
						// Device requests contain audio/video and must remain denied.
						((permission === 'display-capture' ||
							(permission === 'media' &&
								'mediaTypes' in details &&
								Array.isArray(details.mediaTypes) &&
								details.mediaTypes.length === 0)) &&
							trustedTradingContents(contents) &&
							details.isMainFrame &&
							isTradingPage(details.requestingUrl)))
			)
	)
	current.webContents.session.setPermissionCheckHandler(
		(contents, permission, requestingOrigin, details) =>
			contents === current.webContents &&
			isLocal(requestingOrigin) &&
			(permission === 'clipboard-sanitized-write' ||
				permission === 'notifications' ||
				(permission === 'display-capture' &&
					trustedTradingContents(contents) &&
					details.isMainFrame &&
					isTradingPage(details.requestingUrl ?? '')))
	)
	let capturePromptOpen = false
	let captureNavigation = 0
	current.webContents.on('did-start-navigation', () => {
		// Invalidate pending consent even if navigation later returns to trading.
		captureNavigation++
	})
	current.webContents.session.setDisplayMediaRequestHandler(
		(request, callback) => {
			const navigation = captureNavigation
			const frame = request.frame
			const trustedRequest = () =>
				trustedTradingContents(current.webContents) &&
				captureNavigation === navigation &&
				frame !== null &&
				request.frame === frame &&
				frame === current.webContents.mainFrame &&
				isTradingPage(frame.url) &&
				isLocal(request.securityOrigin) &&
				request.userGesture &&
				request.videoRequested &&
				!request.audioRequested
			const respond = (streams: Electron.Streams) => {
				try {
					callback(streams)
				} catch {
					// Electron throws if the requesting frame was destroyed.
				}
			}
			if (capturePromptOpen || !trustedRequest()) {
				respond({})
				return
			}
			capturePromptOpen = true
			void (async () => {
				let streams: Electron.Streams = {}
				try {
					const sources = await desktopCapturer.getSources({
						types: ['screen', 'window'],
						thumbnailSize: { width: 0, height: 0 },
						fetchWindowIcons: false,
					})
					if (!trustedRequest() || sources.length === 0) return
					const gameWindow = await findGameWindow(sources)
					if (!trustedRequest()) return
					if (gameWindow) {
						streams = { video: gameWindow }
						return
					}
					// PipeWire returns the source already chosen in the compositor's
					// portal, not a list of windows. Do not open a second modal and
					// steal focus from the chosen window in a tiling compositor.
					const wayland =
						process.platform === 'linux' &&
						(process.env.XDG_SESSION_TYPE === 'wayland' ||
							!!process.env.WAYLAND_DISPLAY)
					if (wayland && sources.length === 1) {
						streams = { video: sources[0] }
						return
					}
					const { response } = await dialog.showMessageBox(current, {
						type: 'question',
						title: 'Trading OCR screen capture',
						message:
							'Choose a screen or window to share with Trading OCR',
						detail: 'Only the selected source will be captured. Screens may include other apps and private information. No audio is shared.',
						buttons: [
							'Cancel',
							...sources.map(
								(source, index) =>
									`${index + 1}. ${source.id.startsWith('screen:') ? 'Screen' : 'Window'}: ${source.name.replace(/[\r\n	]/g, ' ')}`
							),
						],
						defaultId: 0,
						cancelId: 0,
						noLink: true,
					})
					const selected = sources[response - 1]
					if (selected && trustedRequest())
						streams = { video: selected }
				} catch (error) {
					console.error('Trading screen capture failed', error)
				} finally {
					capturePromptOpen = false
					respond(streams)
				}
			})()
		}
	)
	current.webContents.on('will-attach-webview', (event) =>
		event.preventDefault()
	)
	current.webContents.on('will-navigate', (event, url) => {
		if (isLocal(url)) return
		event.preventDefault()
		try {
			void shell.openExternal(externalUrl(url)).catch(console.error)
		} catch {
			/* Deny unsafe schemes. */
		}
	})
	current.webContents.on('will-redirect', (event, url) => {
		if (!isLocal(url)) event.preventDefault()
	})
	current.webContents.setWindowOpenHandler(({ url }) => {
		if (isLocal(url)) {
			void current.loadURL(url)
			return { action: 'deny' }
		}
		try {
			void shell.openExternal(externalUrl(url)).catch(console.error)
		} catch {
			/* Deny unsafe schemes. */
		}
		return { action: 'deny' }
	})
	current.webContents.on(
		'did-start-navigation',
		(_event, _url, inPlace, mainFrame) => {
			if (mainFrame && !inPlace) rendererReady = false
		}
	)
	current.webContents.on('render-process-gone', () => {
		rendererReady = false
	})
	current.once('ready-to-show', () => current.show())
	current.on('closed', () => {
		window = null
		rendererReady = false
		closeTradingOverlay()
	})
	current.webContents.on(
		'did-fail-load',
		(_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
			if (isMainFrame) {
				console.error(
					`Renderer failed to load ${validatedURL}: ${errorCode} ${errorDescription}`
				)
			}
		}
	)
	current.webContents.on('render-process-gone', (_event, details) => {
		console.error('Renderer process gone', details.reason, details.exitCode)
	})
	await current.loadURL(origin)
}

if (started || !app.requestSingleInstanceLock()) {
	app.quit()
} else {
	app.on('open-url', (event, url) => {
		event.preventDefault()
		acceptCallback(url)
	})
	app.on('second-instance', (_event, argv) => {
		argv.forEach(acceptCallback)
		if (!window && origin) void createWindow().catch(console.error)
		else focusWindow()
	})
	process.argv.forEach(acceptCallback)

	for (const channel of ['stalhub:open-external', 'stalhub:begin-auth']) {
		ipcMain.handle(channel, async (event, value: unknown) => {
			if (!trustedSender(event)) throw new Error('Untrusted IPC sender')
			await shell.openExternal(externalUrl(value))
		})
	}
	ipcMain.on('stalhub:renderer-ready', (event) => {
		if (trustedSender(event)) {
			rendererReady = true
			flushCallbacks()
		}
	})
	ipcMain.on('stalhub:renderer-not-ready', (event) => {
		if (trustedSender(event)) rendererReady = false
	})
	ipcMain.handle('stalhub:trading-overlay:open', (event) => {
		if (!trustedSender(event)) throw new Error('Untrusted IPC sender')
		return createTradingOverlay()
	})
	ipcMain.handle('stalhub:trading-overlay:close', (event) => {
		if (!trustedSender(event) && !trustedOverlaySender(event))
			throw new Error('Untrusted IPC sender')
		closeTradingOverlay()
		return true
	})
	ipcMain.on('stalhub:trading-overlay:update', (event, state: unknown) => {
		if (!trustedSender(event)) throw new Error('Untrusted IPC sender')
		if (!state || typeof state !== 'object') return
		lastOverlayState = state
		sendOverlayState()
	})
	ipcMain.on('stalhub:trading-overlay:complete', (event) => {
		if (!trustedOverlaySender(event))
			throw new Error('Untrusted IPC sender')
		if (window && !window.isDestroyed()) {
			window.webContents.send('stalhub:trading-overlay:complete')
		}
	})
	ipcMain.handle('stalhub:updates:info', (event) => {
		if (!trustedSender(event)) throw new Error('Untrusted IPC sender')
		return updateState
	})
	ipcMain.handle('stalhub:updates:set-auto', (event, enabled: unknown) => {
		if (!trustedSender(event)) throw new Error('Untrusted IPC sender')
		const autoUpdate = enabled === true
		writeAutoUpdateSetting(autoUpdate)
		updateState = { ...updateState, autoUpdate }
		broadcastUpdateStatus()
		if (autoUpdate && updateState.supported) {
			checkingUpdate = true
			autoUpdater
				.checkForUpdatesAndNotify()
				.catch(console.error)
				.finally(() => {
					checkingUpdate = false
				})
		}
		return updateState
	})
	ipcMain.handle('stalhub:updates:check', (event) => {
		if (!trustedSender(event)) throw new Error('Untrusted IPC sender')
		if (!updateState.supported || checkingUpdate) return updateState
		checkingUpdate = true
		setUpdateStatus({ status: 'checking', error: null })
		autoUpdater
			.checkForUpdates()
			.catch(() =>
				setUpdateStatus({
					status: 'error',
					error: 'Update check failed',
				})
			)
			.finally(() => {
				checkingUpdate = false
			})
		return updateState
	})
	ipcMain.on('stalhub:updates:restart', (event) => {
		if (!trustedSender(event)) throw new Error('Untrusted IPC sender')
		autoUpdater.quitAndInstall()
	})
	app.whenReady()
		.then(async () => {
			// Linux silently drops setAsDefaultProtocolClient before 'ready': it must
			// be registered after the app is ready or the xdg scheme handler is absent.
			if (process.defaultApp && process.argv[1])
				app.setAsDefaultProtocolClient('stalhub', process.execPath, [
					path.resolve(process.argv[1]),
				])
			else app.setAsDefaultProtocolClient('stalhub')
			capabilityToken = randomBytes(32).toString('hex')
			origin = await startServer()
			configureAutoUpdates()
			await createWindow()
		})
		.catch((error: Error) => {
			dialog.showErrorBox('Unable to start Stalhub', error.message)
			app.quit()
		})
	app.on('activate', () => {
		if (origin && !quitting) void createWindow().catch(console.error)
	})
	app.on('window-all-closed', () => {
		if (process.platform !== 'darwin') app.quit()
	})
	app.on('before-quit', (event) => {
		if (quitting || !server) return
		event.preventDefault()
		quitting = true
		const child = server
		const timer = setTimeout(() => {
			child.kill()
			app.quit()
		}, 4000)
		child.once('exit', () => {
			clearTimeout(timer)
			app.quit()
		})
		child.postMessage('shutdown')
	})
}
