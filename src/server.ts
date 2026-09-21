import fs from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'

//! TODO REFACTORING

type ParentPort = {
	postMessage(value: unknown): void
	on(event: 'message', callback: (event: { data: unknown }) => void): void
}
const parent = (process as NodeJS.Process & { parentPort?: ParentPort })
	.parentPort
const root = process.argv[2]
const capability = process.env.STALHUB_CAPABILITY || ''
if (!/^[a-f0-9]{64}$/.test(capability))
	throw new Error('Missing local server capability')
const desiredPort = Number(process.argv[3] || 0)
if (!Number.isInteger(desiredPort) || desiredPort < 0 || desiredPort > 65535)
	throw new Error('Invalid local server port')
if (!parent || !root || !fs.existsSync(path.join(root, 'server.js'))) {
	throw new Error('Missing bundled Next standalone runtime')
}
process.chdir(root)
Object.assign(process.env, { NODE_ENV: 'production' })
process.env.HOSTNAME = '127.0.0.1'
process.env.PORT = '0'
process.env.NEXT_TELEMETRY_DISABLED = '1'

process.env.NO_PROXY = [process.env.NO_PROXY, 'localhost', '127.0.0.1', '::1']
	.filter(Boolean)
	.join(',')
process.env.no_proxy = process.env.NO_PROXY

// Observe the actual ephemeral listen address; no probe-and-release port race.
const originalListen = http.Server.prototype.listen
let nextServer: http.Server | undefined
http.Server.prototype.listen = function (
	this: http.Server,
	...args: Parameters<typeof originalListen>
) {
	if (!nextServer) {
		nextServer = this
		const originalEmit = this.emit
		this.emit = function (
			event: string | symbol,
			...values: unknown[]
		): boolean {
			return (originalEmit as (...args: unknown[]) => boolean).apply(
				this,
				[event, ...values]
			)
		}

		// Next's generated launcher coerces PORT=0 to 3000. Override only this
		// first server's listen arguments so the OS actually allocates the port.
		const listenArgs = args as unknown as unknown[]
		// Keep the capability check at the private loopback boundary; Next handles routes below.
		if (typeof listenArgs[0] === 'object' && listenArgs[0] !== null) {
			listenArgs[0] = {
				...(listenArgs[0] as object),
				port: desiredPort,
				host: '127.0.0.1',
			}
		} else {
			listenArgs[0] = desiredPort
			if (typeof listenArgs[1] === 'string') listenArgs[1] = '127.0.0.1'
		}
		this.once('listening', () => {
			const address = this.address()
			if (address && typeof address !== 'string')
				parent.postMessage({ type: 'listening', port: address.port })
		})
		this.once('error', (error: Error) =>
			parent.postMessage({ type: 'error', message: error.message })
		)
	}
	return originalListen.apply(this, args)
} as typeof originalListen

parent.on('message', ({ data }) => {
	if (data !== 'shutdown') return
	if (nextServer) {
<<<<<<< Updated upstream
		nextServer.close(() => process.exit(0));
		nextServer.closeIdleConnections?.();
		setTimeout(() => process.exit(0), 3000).unref();
	} else process.exit(0);
});
=======
		nextServer.close(() => process.exit(0))
		const idleConnections = (
			nextServer as typeof nextServer & {
				closeIdleConnections?: () => void
			}
		).closeIdleConnections
		idleConnections?.()
		setTimeout(() => process.exit(0), 3000).unref()
	} else process.exit(0)
})
>>>>>>> Stashed changes

// Avoid bundling Next into main; resolve the staged standalone's own modules.
createRequire(path.join(root, 'server.js'))(path.join(root, 'server.js'))
