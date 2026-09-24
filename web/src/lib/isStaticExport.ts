// Единый флаг десктоп-сборки (Tauri, static export).
// NEXT_PUBLIC_* инлайнится и в серверный, и в клиентский бандл на этапе
// `next build`, поэтому константу можно использовать в обоих контекстах.
// build-export.mjs выставляет NEXT_PUBLIC_STATIC_EXPORT=1 (и дублирующий
// STALHUB_STATIC_EXPORT=1 для серверного кода, читающего process.env напрямую).
export const IS_STATIC_EXPORT =
	process.env.NEXT_PUBLIC_STATIC_EXPORT === '1'
