import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const destination = fileURLToPath(new URL('../public/ocr/', import.meta.url))
mkdirSync(destination, { recursive: true })
const worker = path.dirname(require.resolve('tesseract.js/package.json'))
const core = path.dirname(require.resolve('tesseract.js-core/package.json'))
copyFileSync(
	path.join(worker, 'dist/worker.min.js'),
	path.join(destination, 'worker.min.js')
)
for (const name of readdirSync(core)) {
	if (name.endsWith('lstm.wasm.js'))
		copyFileSync(path.join(core, name), path.join(destination, name))
}
console.log('Tesseract worker and WASM cores staged in public/ocr')
