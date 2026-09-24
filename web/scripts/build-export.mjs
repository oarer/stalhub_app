// Десктоп-сборка (Tauri): статический export фронтенда в web/out, куда
// указывает src-tauri frontendDist. Публичный сайт продолжает собираться
// обычным `bun run build` (standalone).
//
// /api/*, /uploads/*, /api/status, /api/og остаются на сайте: статический
// export не поддерживает динамические route handlers, поэтому на время сборки
// папки исключаются, а их вызовы в десктоп-версии идут через Tauri-мост.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const web = path.join(scriptDir, "..");
const out = path.join(web, "out");

const appDir = path.join(web, "src", "app");
const srcDir = path.join(web, "src");
const archiveRoot = path.join(web, ".desktop-excluded");
// Исключаются только route-коллекции. api/interceptors — клиентский модуль
// axios (root.interceptor.ts), не роут, его оставляем. Папки выносятся за
// пределы src/app, иначе Next зарегистрирует их как роуты.
// Динамические роуты с бесконечными параметрами (пользовательский контент)
// нельзя перечислить в generateStaticParams — в десктопе они доступны через
// query-схему поверх статичных страниц (см. src/lib/desktop-href.ts),
// а path-версии остаются на сайте. Конечные роуты (auth providers, maps)
// пререндерятся напрямую через generateStaticParams и не исключаются.
// src/proxy.ts (Proxy/middleware) несовместим с output:'export'; в десктопе
// не нужен (нет серверного хоста, локаль — на клиенте).
// prettier-ignore
const excluded = [
	// API/загрузки — только сайт, в десктопе через Tauri-мост.
	{ base: appDir, rel: "api/v1" },
	{ base: appDir, rel: "api/status" },
	{ base: appDir, rel: "api/og" },
	{ base: appDir, rel: "api/health" },
	{ base: appDir, rel: "api/error-report" },
	{ base: appDir, rel: "uploads" },
	// Бесконечные динамические роуты — только сайт (path-схема, SEO).
	{ base: appDir, rel: "admin/(tabs)/clans/[clanId]" },
	{ base: appDir, rel: "admin/(tabs)/users/[userId]" },
	{ base: appDir, rel: "me/articles/[id]/edit" },
	{ base: appDir, rel: "me/articles/[...slug]" },
	{ base: appDir, rel: "me/arts/[id]/edit" },
	{ base: appDir, rel: "me/arts/[...slug]" },
	{ base: appDir, rel: "me/(tabs)/tierlists/[id]/edit" },
	{ base: appDir, rel: "(public)/articles/[id]" },
	{ base: appDir, rel: "(public)/arts/[id]" },
	{ base: appDir, rel: "(public)/player/[region]/[character]" },
	{ base: appDir, rel: "(public)/tierlists/[id]/edit" },
	{ base: appDir, rel: "(public)/tierlists/[id]" },
	{ base: appDir, rel: "(public)/users/[id]" },
	{ base: appDir, rel: "(tools)/items/[...slug]" },
	// Middleware/Proxy — только сайт.
	{ base: srcDir, rel: "proxy.ts" },
];

function execSync(cmd, args, opts) {
	execFileSync(cmd, args, opts);
}

// Сортировка по глубине: родители раньше детей. Вложенные записи
// ([id]/edit внутри [id]) переезжают вместе с родителем, а дочерняя запись
// становится no-op — иначе restore затирал бы уже возвращённое (rmSync(dst)
// поверх восстановленного родителя удалял вложенное).
const depth = (rel) => rel.split("/").length;
const byDepthAsc = (a, b) => depth(a.rel) - depth(b.rel);

function archive() {
	for (const { base, rel } of [...excluded].sort(byDepthAsc)) {
		const src = path.join(base, rel);
		const dst = path.join(archiveRoot, rel);
		if (fs.existsSync(src) && !fs.existsSync(dst)) {
			fs.mkdirSync(path.dirname(dst), { recursive: true });
			fs.renameSync(src, dst);
		}
	}
}

function restore() {
	for (const { base, rel } of [...excluded].sort(byDepthAsc)) {
		const src = path.join(archiveRoot, rel);
		const dst = path.join(base, rel);
		if (!fs.existsSync(src) || fs.existsSync(dst)) continue;
		fs.mkdirSync(path.dirname(dst), { recursive: true });
		fs.renameSync(src, dst);
	}
	// Убрать пустые каталоги-остатки архива.
	fs.rmSync(archiveRoot, { recursive: true, force: true });
}

fs.rmSync(out, { recursive: true, force: true });
fs.rmSync(path.join(web, ".next"), { recursive: true, force: true });
archive();
let exitCode = 0;
try {
	execSync(process.execPath, [path.join(web, "scripts/prepare-ocr.mjs")], {
		cwd: web,
		stdio: "inherit",
	});

	console.log("[build:export] building static Next export");
	// Локальный escape hatch: NEXT_BUILD_WEBPACK=1 (верификация за прокси,
	// где Turbopack не умеет мокать шрифты). В CI не использовать.
	const extraArgs = process.env.NEXT_BUILD_WEBPACK === "1" ? ["--webpack"] : [];
	execSync(
		process.execPath,
		[path.join(web, "node_modules", "next", "dist", "bin", "next"), "build", ...extraArgs],
		{
			cwd: web,
			stdio: "inherit",
			env: {
				...process.env,
				NODE_ENV: "production",
				STALHUB_STATIC_EXPORT: "1",
				NEXT_PUBLIC_STATIC_EXPORT: "1",
				// Prerender ходит за публичными данными напрямую в prod API:
				// .env.local указывает на локальный dev-бэкенд, которого нет
				// ни в CI, ни при релизной сборке. Явный env побеждает .env.
				STALHUB_API_ORIGIN: "https://api.stalhub.dev",
				// Прямые ссылки картинок в десктопе (там нет /api/* и
				// /uploads/* роутов): см. web/src/lib/imageUrl.ts.
				NEXT_PUBLIC_API_ORIGIN: "https://api.stalhub.dev",
			},
		}
	);
} catch (error) {
	exitCode = 1;
	console.error(error);
} finally {
	restore();
}

if (exitCode !== 0) process.exit(exitCode);

if (!fs.existsSync(out)) {
	console.error("[build:export] static export output missing at", out);
	process.exit(1);
}

console.log("[build:export] done ->", out);