import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'out')
const packaged = path.join(output, 'Stalhub-linux-x64')
const appDir = path.join(output, 'AppDir')
const target = path.join(output, 'Stalhub-x86_64.AppImage')
const targetTemp = `${target}.tmp-${process.pid}`
const tool = path.join(os.tmpdir(), 'stalhub-appimagetool-x86_64.AppImage')
const toolUrl =
	'https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage'

function run(command, args, options = {}) {
	console.log(`$ ${command} ${args.join(' ')}`)
	execFileSync(command, args, { cwd: root, stdio: 'inherit', ...options })
}

function downloadTool() {
	if (fs.existsSync(tool)) return
	run('curl', ['-L', '--fail', '--retry', '3', '-o', tool, toolUrl])
	fs.chmodSync(tool, 0o755)
}

console.log('[appimage] building Linux Electron package')
run('bun', ['run', 'package', '--', '--platform=linux', '--arch=x64'])

if (!fs.existsSync(path.join(packaged, 'stalhub_app'))) {
	throw new Error(`Electron package binary not found: ${path.join(packaged, 'stalhub_app')}`)
}

fs.rmSync(appDir, { recursive: true, force: true })
fs.mkdirSync(path.join(appDir, 'usr', 'lib', 'stalhub'), { recursive: true })
fs.mkdirSync(path.join(appDir, 'usr', 'share', 'applications'), { recursive: true })
fs.cpSync(packaged, path.join(appDir, 'usr', 'lib', 'stalhub'), { recursive: true })
fs.writeFileSync(
	path.join(appDir, 'AppRun'),
	'#!/bin/sh\nHERE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexec "$HERE/usr/lib/stalhub/stalhub_app" "$@"\n',
)
fs.chmodSync(path.join(appDir, 'AppRun'), 0o755)
fs.writeFileSync(
	path.join(appDir, 'stalhub.desktop'),
	'[Desktop Entry]\nType=Application\nName=Stalhub\nExec=AppRun\nIcon=stalhub\nCategories=Utility;\nTerminal=false\n',
)
fs.writeFileSync(
	path.join(appDir, 'stalhub.svg'),
	'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="32" fill="#111827"/><text x="128" y="154" text-anchor="middle" fill="#fff" font-size="72" font-family="sans-serif">S</text></svg>',
)

downloadTool()
fs.rmSync(targetTemp, { force: true })
run(tool, ['--appimage-extract-and-run', appDir, targetTemp])
fs.renameSync(targetTemp, target)
console.log(`[appimage] created ${target}`)
