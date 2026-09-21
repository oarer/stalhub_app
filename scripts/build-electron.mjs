// Bundles the Electron main process, the forked local server and the preload
// script into .vite/build. This replaces the @electron-forge/plugin-vite build:
// electron-builder only packages pre-built code, so the Vite bundling that Forge
// used to inject lives here. Externals mirror Forge's defaults (electron + Node
// builtins); every other dependency is bundled into the output.
import { builtinModules } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, ".vite", "build");

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const external = [
	"electron",
	"electron/main",
	"electron/common",
	"electron/renderer",
	// Production dependencies stay external so electron-builder ships them from
	// node_modules (electron-updater is happiest unbundled).
	...Object.keys(pkg.dependencies ?? {}),
	...builtinModules,
	...builtinModules.map((name) => `node:${name}`),
];

const resolve = {
	conditions: ["node"],
	mainFields: ["module", "jsnext:main", "jsnext"],
};

const shared = {
	root,
	configFile: false,
	mode: "production",
	logLevel: "info",
	clearScreen: false,
	resolve,
};

console.log("[build-electron] bundling main + server");
await build({
	...shared,
	build: {
		outDir,
		emptyOutDir: true,
		copyPublicDir: false,
		minify: true,
		lib: {
			entry: { main: "src/main.ts", server: "src/server.ts" },
			formats: ["cjs"],
			fileName: (_format, entryName) => `${entryName}.js`,
		},
		rollupOptions: { external },
	},
});

console.log("[build-electron] bundling preload");
await build({
	...shared,
	build: {
		outDir,
		emptyOutDir: false,
		copyPublicDir: false,
		minify: true,
		rollupOptions: {
			external,
			input: "src/preload.ts",
			output: {
				format: "cjs",
				inlineDynamicImports: true,
				entryFileNames: "[name].js",
				chunkFileNames: "[name].js",
				assetFileNames: "[name].[ext]",
			},
		},
	},
});

console.log(`[build-electron] done -> ${path.relative(root, outDir)}`);
