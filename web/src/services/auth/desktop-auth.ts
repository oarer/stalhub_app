import { apiClient } from "@/app/api/interceptors/root.interceptor";

type Bridge = {
	beginAuth(url: string): Promise<void>;
	onAuthCallback(callback: (url: string) => void): () => void;
	platform?: string;
};
const bridge = () =>
	(window as unknown as { stalhubDesktop?: Bridge }).stalhubDesktop;
export function isDesktop(): boolean {
	return bridge() !== undefined;
}
const encode = (bytes: Uint8Array) =>
	btoa(String.fromCharCode(...bytes))
		.replace(/=/g, "")
		.replace(/\+/g, "-")
		.replace(/\//g, "_");

const INTENT_KEY = "stalhub.desktop.intent";
export type DesktopIntent = { desktop_state: string; code_challenge: string };

export function persistDesktopIntent(intent: DesktopIntent): void {
	sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent));
}
export function getDesktopIntent(): DesktopIntent | null {
	const raw = sessionStorage.getItem(INTENT_KEY);
	if (!raw) return null;
	try {
		const value = JSON.parse(raw) as DesktopIntent;
		if (
			typeof value.desktop_state === "string" &&
			typeof value.code_challenge === "string"
		)
			return value;
	} catch {
		/* ignore malformed intent */
	}
	return null;
}
export function clearDesktopIntent(): void {
	sessionStorage.removeItem(INTENT_KEY);
}

/** Exchange a logged-in site session for a single-use deeplink bound to the desktop PKCE challenge. */
export async function issueDesktopLoginUrl(): Promise<string> {
	const intent = getDesktopIntent();
	if (!intent) throw new Error("No desktop intent");
	const { data } = await apiClient.post<{ url: string }>(
		"/api/v1/auth/desktop/issue",
		intent,
	);
	return data.url;
}

/** Keep the verifier in memory; never put it in browser URLs or persistent storage. */
let activeHandoff: Promise<boolean> | null = null;
export async function desktopLogin(): Promise<boolean> {
	const desktop = bridge();
	if (!desktop) return false;
	if (activeHandoff) return activeHandoff;
	activeHandoff = (async () => {
		const verifier = encode(crypto.getRandomValues(new Uint8Array(32)));
		const state = encode(crypto.getRandomValues(new Uint8Array(32)));
		const challenge = encode(
			new Uint8Array(
				await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
			),
		);
		const { data } = await apiClient.get<{ url: string }>(
			"/api/v1/auth/desktop/start",
			{
				params: { desktop_state: state, code_challenge: challenge },
				skipAuthRefresh: true,
			},
		);
		await new Promise<void>((resolve, reject) => {
			let settled = false;
			let unsubscribe = () => {
				/* Assigned after the callback subscription is created. */
			};
			const timer = setTimeout(() => {
				unsubscribe();
				reject(new Error("Authentication timed out"));
			}, 600_000);
			unsubscribe = desktop.onAuthCallback(async (raw) => {
				let callback: URL;
				try {
					callback = new URL(raw);
				} catch {
					return;
				}
				if (
					settled ||
					callback.protocol !== "stalhub:" ||
					callback.host !== "auth" ||
					callback.pathname !== "/callback" ||
					callback.searchParams.get("state") !== state
				)
					return;
				const code = callback.searchParams.get("code");
				if (!code || !/^[0-9a-f-]{60,80}$/i.test(code)) return;
				settled = true;
				clearTimeout(timer);
				unsubscribe();
				try {
await apiClient.post(
					"/api/v1/auth/desktop/exchange",
					{ code, code_verifier: verifier, platform: desktop.platform },
					{ skipAuthRefresh: true },
				);
					window.location.replace("/me/onboarding");
					resolve();
				} catch (error) {
					reject(error);
				}
			});
			desktop.beginAuth(data.url).catch((error) => {
				clearTimeout(timer);
				unsubscribe();
				reject(error);
			});
		});
		return true;
	})().finally(() => {
		activeHandoff = null;
	});
	return activeHandoff;
}
