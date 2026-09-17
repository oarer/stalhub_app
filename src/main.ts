import { randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import {
	app,
	BrowserWindow,
	dialog,
	ipcMain,
	shell,
	type UtilityProcess,
	utilityProcess,
} from "electron";
import started from "electron-squirrel-startup";

let window: BrowserWindow | null = null;
let server: UtilityProcess | undefined;
let origin = "";
let capabilityToken = "";
let rendererReady = false;
let quitting = false;
const pending: string[] = [];

function callbackUrl(value: unknown): string | null {
	if (typeof value !== "string" || value.length > 8192) return null;
	try {
		const url = new URL(value);
		return url.protocol === "stalhub:" &&
			url.hostname === "auth" &&
			url.pathname === "/callback" &&
			!url.username &&
			!url.password &&
			!url.port &&
			!url.hash
			? url.href
			: null;
	} catch {
		return null;
	}
}
function externalUrl(value: unknown): string {
	if (typeof value !== "string" || value.length > 8192)
		throw new Error("Invalid external URL");
	const url = new URL(value);
	if (url.username || url.password)
		throw new Error("Credentials in external URLs are forbidden");
	if (url.protocol === "https:" || url.protocol === "http:") return url.href;
	throw new Error("Only web external URLs are permitted");
}
function isLocal(value: string): boolean {
	try {
		return new URL(value).origin === origin;
	} catch {
		return false;
	}
}
function focusWindow() {
	if (!window) return;
	if (window.isMinimized()) window.restore();
	window.show();
	window.focus();
}
function flushCallbacks() {
	if (!rendererReady || !window || window.webContents.isDestroyed()) return;
	while (pending.length)
		window.webContents.send("stalhub:auth-callback", pending.shift());
}
function acceptCallback(value: unknown) {
	const url = callbackUrl(value);
	if (!url) return;
	if (!pending.includes(url)) {
		if (pending.length >= 16) pending.shift();
		pending.push(url);
	}
	focusWindow();
	flushCallbacks();
}
function trustedSender(
	event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent,
): boolean {
	return (
		!!window &&
		event.sender === window.webContents &&
		event.senderFrame === window.webContents.mainFrame &&
		isLocal(event.senderFrame.url)
	);
}
function waitForHttp(url: string, deadline: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const retry = () => {
			if (!server || quitting || Date.now() >= deadline)
				reject(new Error("Local web server did not become ready"));
			else
				setTimeout(() => waitForHttp(url, deadline).then(resolve, reject), 150);
		};
		const request = http.get(
			url,
			{ headers: { "x-stalhub-capability": capabilityToken } },
			(response) => {
				response.resume();
				if (response.statusCode && response.statusCode < 500) resolve();
				else retry();
			},
		);
		request.setTimeout(2000, () =>
			request.destroy(new Error("Readiness request timeout")),
		);
		request.once("error", retry);
	});
}
async function startServer(): Promise<string> {
	const root = app.isPackaged
		? path.join(process.resourcesPath, "web")
		: path.join(app.getAppPath(), "runtime/web");
	const portFile = path.join(app.getPath("userData"), "local-server-port.json");
	let savedPort = 0;
	try {
		const value = JSON.parse(fs.readFileSync(portFile, "utf8"));
		if (Number.isInteger(value) && value >= 1024 && value <= 65535)
			savedPort = value;
	} catch {
		/* First launch. */
	}
	capabilityToken = randomBytes(32).toString("hex");
	const childEnv: Record<string, string | undefined> = {
		...process.env,
		STALHUB_CAPABILITY: capabilityToken,
		NODE_ENV: "production",
		HOSTNAME: "127.0.0.1",
		PORT: "0",
	};
	// The renderer API client proxies /api/v1/* to STALHUB_API_ORIGIN. In dev the
	// sane default is the locally running backend; packaged builds hit the prod API.
	childEnv.STALHUB_API_ORIGIN =
		childEnv.STALHUB_API_ORIGIN ||
		(app.isPackaged ? "https://api.stalhub.dev" : "http://localhost:3001");
	const child = utilityProcess.fork(
		path.join(__dirname, "server.js"),
		[root, String(savedPort)],
		{
			cwd: root,
			env: childEnv,
			stdio: "pipe",
			serviceName: "Stalhub local web server",
		},
	);
	server = child;
	child.stdout?.on("data", (chunk) =>
		console.log("[web]", String(chunk).trimEnd()),
	);
	child.stderr?.on("data", (chunk) =>
		console.error("[web]", String(chunk).trimEnd()),
	);
	child.on("exit", (code) => {
		if (server === child) server = undefined;
		if (origin && !quitting) {
			dialog.showErrorBox(
				"Stalhub server stopped",
				`The local web server exited (${code}). Please restart Stalhub.`,
			);
			app.quit();
		}
	});
	const port = await new Promise<number>((resolve, reject) => {
		const timeout = setTimeout(() => {
			child.kill();
			reject(new Error("Local server startup timed out"));
		}, 45000);
		child.once("exit", (code) => {
			clearTimeout(timeout);
			reject(new Error(`Local server exited (${code})`));
		});
		child.on(
			"message",
			(message: { type?: string; port?: number; message?: string }) => {
				if (message?.type === "error") {
					clearTimeout(timeout);
					reject(new Error(message.message || "Local server error"));
				}
				if (
					message?.type === "listening" &&
					typeof message.port === "number" &&
					Number.isInteger(message.port) &&
					message.port > 0 &&
					message.port <= 65535
				) {
					clearTimeout(timeout);
					resolve(message.port);
				}
			},
		);
	});
	fs.mkdirSync(path.dirname(portFile), { recursive: true });
	fs.writeFileSync(portFile, JSON.stringify(port), { mode: 0o600 });
	const url = `http://127.0.0.1:${port}`;
	await waitForHttp(url, Date.now() + 45000);
	return url;
}
async function createWindow() {
	if (window) {
		focusWindow();
		return;
	}
	window = new BrowserWindow({
		title: "Stalhub",
		width: 1440,
		height: 960,
		minWidth: 900,
		minHeight: 640,
		show: false,
		backgroundColor: "#09090b",
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
			webSecurity: true,
			allowRunningInsecureContent: false,
			webviewTag: false,
		},
	});
	const current = window;
	const osLabel =
		(
			{ win32: "Windows", darwin: "macOS", linux: "Linux" } as Record<
				string,
				string
			>
		)[process.platform] ?? process.platform;
	current.webContents.setUserAgent(
		`StalHubApp_${osLabel} ${current.webContents.userAgent}`,
	);
	current.webContents.session.webRequest.onBeforeSendHeaders(
		(details, callback) => {
			const headers = details.requestHeaders;
			delete headers["x-stalhub-capability"];
			if (isLocal(details.url))
				headers["x-stalhub-capability"] = capabilityToken;
			callback({ requestHeaders: headers });
		},
	);
	current.webContents.session.webRequest.onHeadersReceived(
		(details, callback) => {
			const headers = details.responseHeaders || {};
			if (isLocal(details.url)) {
				headers["Content-Security-Policy"] = [
					"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://telegram.org https://oauth.telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' https: data:; connect-src 'self' https:; worker-src 'self' blob:; media-src 'self' https: blob: data:; frame-src https://oauth.telegram.org https://www.youtube.com https://www.youtube-nocookie.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
				];
				headers["X-Content-Type-Options"] = ["nosniff"];
			}
			callback({ responseHeaders: headers });
		},
	);
	current.webContents.session.setPermissionRequestHandler(
		(contents, permission, callback) =>
			callback(
				contents === current.webContents &&
					isLocal(contents.getURL()) &&
					permission === "clipboard-sanitized-write",
			),
	);
	current.webContents.session.setPermissionCheckHandler(
		(contents, permission, requestingOrigin) =>
			contents === current.webContents &&
			isLocal(requestingOrigin) &&
			permission === "clipboard-sanitized-write",
	);
	current.webContents.on("will-attach-webview", (event) =>
		event.preventDefault(),
	);
	current.webContents.on("will-navigate", (event, url) => {
		if (isLocal(url)) return;
		event.preventDefault();
		try {
			void shell.openExternal(externalUrl(url)).catch(console.error);
		} catch {
			/* Deny unsafe schemes. */
		}
	});
	current.webContents.on("will-redirect", (event, url) => {
		if (!isLocal(url)) event.preventDefault();
	});
	current.webContents.setWindowOpenHandler(({ url }) => {
		if (isLocal(url)) {
			void current.loadURL(url);
			return { action: "deny" };
		}
		try {
			void shell.openExternal(externalUrl(url)).catch(console.error);
		} catch {
			/* Deny unsafe schemes. */
		}
		return { action: "deny" };
	});
	current.webContents.on(
		"did-start-navigation",
		(_event, _url, inPlace, mainFrame) => {
			if (mainFrame && !inPlace) rendererReady = false;
		},
	);
	current.webContents.on("render-process-gone", () => {
		rendererReady = false;
	});
	current.once("ready-to-show", () => current.show());
	current.on("closed", () => {
		window = null;
		rendererReady = false;
	});
	await current.loadURL(origin);
}

if (started || !app.requestSingleInstanceLock()) {
	app.quit();
} else {
	app.on("open-url", (event, url) => {
		event.preventDefault();
		acceptCallback(url);
	});
	app.on("second-instance", (_event, argv) => {
		argv.forEach(acceptCallback);
		if (!window && origin) void createWindow().catch(console.error);
		else focusWindow();
	});
	process.argv.forEach(acceptCallback);

	for (const channel of ["stalhub:open-external", "stalhub:begin-auth"]) {
		ipcMain.handle(channel, async (event, value: unknown) => {
			if (!trustedSender(event)) throw new Error("Untrusted IPC sender");
			await shell.openExternal(externalUrl(value));
		});
	}
	ipcMain.on("stalhub:renderer-ready", (event) => {
		if (trustedSender(event)) {
			rendererReady = true;
			flushCallbacks();
		}
	});
	ipcMain.on("stalhub:renderer-not-ready", (event) => {
		if (trustedSender(event)) rendererReady = false;
	});
	app
		.whenReady()
		.then(async () => {
			// Linux silently drops setAsDefaultProtocolClient before 'ready': it must
			// be registered after the app is ready or the xdg scheme handler is absent.
			if (process.defaultApp && process.argv[1])
				app.setAsDefaultProtocolClient("stalhub", process.execPath, [
					path.resolve(process.argv[1]),
				]);
			else app.setAsDefaultProtocolClient("stalhub");
			origin = await startServer();
			await createWindow();
		})
		.catch((error: Error) => {
			dialog.showErrorBox("Unable to start Stalhub", error.message);
			app.quit();
		});
	app.on("activate", () => {
		if (origin && !quitting) void createWindow().catch(console.error);
	});
	app.on("window-all-closed", () => {
		if (process.platform !== "darwin") app.quit();
	});
	app.on("before-quit", (event) => {
		if (quitting || !server) return;
		event.preventDefault();
		quitting = true;
		const child = server;
		const timer = setTimeout(() => {
			child.kill();
			app.quit();
		}, 4000);
		child.once("exit", () => {
			clearTimeout(timer);
			app.quit();
		});
		child.postMessage("shutdown");
	});
}
