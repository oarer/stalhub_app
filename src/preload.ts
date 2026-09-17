import { contextBridge, ipcRenderer } from "electron";

const listeners = new Set<(url: string) => void>();
ipcRenderer.on("stalhub:auth-callback", (_event, url: unknown) => {
	if (typeof url !== "string") return;
	for (const listener of listeners) {
		try {
			listener(url);
		} catch {
			/* One subscriber must not block the others. */
		}
	}
	window.dispatchEvent(
		new CustomEvent("stalhub:auth-callback", { detail: url }),
	);
});

contextBridge.exposeInMainWorld(
	"stalhubDesktop",
	Object.freeze({
		platform: process.platform,
		beginAuth: (url: string): Promise<void> =>
			ipcRenderer.invoke("stalhub:begin-auth", url),
		openExternal: (url: string): Promise<void> =>
			ipcRenderer.invoke("stalhub:open-external", url),
		onAuthCallback: (callback: (url: string) => void) => {
			if (typeof callback !== "function")
				throw new TypeError("Expected callback");
			listeners.add(callback);
			ipcRenderer.send("stalhub:renderer-ready");
			return () => {
				listeners.delete(callback);
				if (listeners.size === 0)
					ipcRenderer.send("stalhub:renderer-not-ready");
			};
		},
	}),
);
