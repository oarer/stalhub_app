import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)

// Read only the main HWND of the exact game processes. Do not match window titles:
// browser tabs and launchers can also contain the game's name.
const query = `@([System.Diagnostics.Process]::GetProcesses() | Where-Object { $_.ProcessName -in @('stalzone', 'stalcraft') } | ForEach-Object { try { if ($_.MainWindowHandle -ne [IntPtr]::Zero) { [PSCustomObject]@{ name = $_.ProcessName; handle = $_.MainWindowHandle.ToInt64().ToString() } } } catch {} }) | ConvertTo-Json -Compress`

type WindowSource = { id: string }

export function matchGameWindow<T extends WindowSource>(
	sources: T[],
	output: string
): T | undefined {
	const data: unknown = JSON.parse(output.replace(/^\uFEFF/, '') || '[]')
	const rows = Array.isArray(data) ? data : [data]
	for (const name of ['stalzone', 'stalcraft']) {
		for (const row of rows) {
			if (
				!row ||
				typeof row !== 'object' ||
				row.name?.toLowerCase() !== name ||
				typeof row.handle !== 'string' ||
				!/^\d+$/.test(row.handle) ||
				BigInt(row.handle) === 0n
			)
				continue
			const match = sources.find((source) => {
				const handle = /^window:(\d+):/.exec(source.id)?.[1]
				return (
					handle !== undefined &&
					BigInt(handle) === BigInt(row.handle)
				)
			})
			if (match) return match
		}
	}
	return undefined
}

export async function findGameWindow<T extends WindowSource>(
	sources: T[]
): Promise<T | undefined> {
	if (process.platform !== 'win32') return undefined
	try {
		const root = process.env.SystemRoot
		if (!root) return undefined
		const { stdout } = await execute(
			path.join(
				root,
				'System32',
				'WindowsPowerShell',
				'v1.0',
				'powershell.exe'
			),
			['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', query],
			{ windowsHide: true, timeout: 4000, maxBuffer: 256 * 1024 }
		)
		return matchGameWindow(sources, stdout.trim())
	} catch {
		// Missing PowerShell, restricted process access, exit races and timeouts all
		// fall back to explicit source selection instead of blocking capture.
		return undefined
	}
}
