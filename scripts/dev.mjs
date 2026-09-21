import { execFileSync, spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptDir, "..");
const web = path.join(root, "web");
execFileSync(process.execPath, [path.join(web, "scripts/prepare-ocr.mjs")], { cwd: web, stdio: "inherit" });

const host = process.env.STALHUB_WEB_DEV_HOST ?? "127.0.0.1";
const port = process.env.STALHUB_WEB_DEV_PORT ?? "3002";
const devUrl = `http://${host}:${port}`;

function waitForHttp(url, deadline) {
	return new Promise((resolve, reject) => {
		const retry = () => {
			if (Date.now() >= deadline)
				return reject(new Error(`Timed out waiting for ${url}`));
			setTimeout(() => waitForHttp(url, deadline).then(resolve, reject), 200);
		};
		const request = http.get(url, (response) => {
			response.resume();
			if (response.statusCode && response.statusCode < 500) resolve();
			else retry();
		});
		request.setTimeout(1500, () =>
			request.destroy(new Error("Readiness request timeout")),
		);
		request.once("error", retry);
	});
}

let shuttingDown = false;
let electron;

function shutdown(code = 0) {
	if (shuttingDown) return;
	shuttingDown = true;
	nextDev.kill();
	electron?.kill();
	process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const nextBin = path.join(web, "node_modules", "next", "dist", "bin", "next");
const nextDev = spawn(
	process.execPath,
	[nextBin, "dev", "-H", host, "-p", port, "--turbopack"],
	{ cwd: web, stdio: "inherit" },
);

nextDev.on("exit", (code) => {
	if (shuttingDown) return;
	if (electron) {
		console.error(`[dev] next dev exited (${code}); stopping Electron`);
		electron.kill();
	}
	shuttingDown = true;
	process.exit(code ?? 0);
});

try {
	await waitForHttp(devUrl, Date.now() + 60000);
} catch (error) {
	nextDev.kill();
	console.error(error.message);
	process.exit(1);
}

console.log(`[dev] web dev server ready at ${devUrl}`);

const forgeCli = path.join(
	root,
	"node_modules",
	"@electron-forge",
	"cli",
	"dist",
	"electron-forge.js",
);
electron = spawn(process.execPath, [forgeCli, "start"], {
	cwd: root,
	stdio: "inherit",
	env: { ...process.env, STALHUB_WEB_DEV_URL: devUrl },
});

electron.on("exit", (code) => {
	if (shuttingDown) return;
	shuttingDown = true;
	nextDev.kill();
	process.exit(code ?? 0);
});