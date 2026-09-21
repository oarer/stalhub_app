// Builds the embedded Next.js app into a self-contained standalone runtime at
// runtime/web. src/server.ts (forked as the Electron utility process) requires
// runtime/web/server.js, so the staged tree mirrors .next/standalone plus the
// static assets and public files Next keeps outside of standalone output.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptDir, "..");
const web = path.join(root, "web");
const out = path.join(root, "runtime/web");

const next = path.join(
	web,
	"node_modules",
	"next",
	"dist",
	"bin",
	"next",
);

const from = (parts) => path.join(web, ...parts);
const to = (parts) => path.join(out, ...parts);

function removeAll(dir) {
	fs.rmSync(dir, { recursive: true, force: true });
	fs.mkdirSync(dir, { recursive: true });
}

function copy(source, target) {
	fs.cpSync(source, target, {
		recursive: true,
		force: true,
		verbatimSymlinks: true,
		dereference: false,
	});
}

console.log("[build-web] building Next standalone app");
execFileSync(process.execPath, [path.join(web, "scripts/prepare-ocr.mjs")], { cwd: web, stdio: "inherit" });
execFileSync(process.execPath, [next, "build"], {
	cwd: web,
	stdio: "inherit",
	env: { ...process.env, NODE_ENV: "production" },
});

console.log("[build-web] staging standalone runtime at", out);
removeAll(out);

const standalone = from([".next", "standalone"]);
if (!fs.existsSync(path.join(standalone, "server.js"))) {
	console.error("[build-web] standalone server.js missing after build");
	process.exit(1);
}
copy(standalone, out);

const staticDir = from([".next", "static"]);
if (fs.existsSync(staticDir)) copy(staticDir, to([".next", "static"]));

const publicDir = from(["public"]);
if (fs.existsSync(publicDir)) copy(publicDir, to(["public"]));

console.log("[build-web] done");