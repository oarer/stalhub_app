import { isTauri } from '@/lib/tauri-bridge'
import type {
	BlockerAddressList,
	BlockerFirewallStatus,
	BlockerPing,
	BlockerRegion,
} from '@/types/server-blocker.type'

const REGION_URL: Record<BlockerRegion, string> = {
	RU: 'https://backend.stalzone.net/address_list?login=User',
	NEA: 'https://backend-nea.stalzone.net/address_list?login=User',
	SEA: 'https://backend-sea.stalzone.net/address_list?login=User',
	EU: 'https://backend-eu.stalzone.net/address_list?login=User',
	NA: 'https://backend-na.stalzone.net/address_list?login=User',
}

async function invokeTauri<T>(
	cmd: string,
	args?: Record<string, unknown>
): Promise<T> {
	const { invoke } = await import('@tauri-apps/api/core')
	return invoke<T>(cmd, args)
}

export async function fetchBlockerServers(
	region: BlockerRegion
): Promise<BlockerAddressList> {
	if (isTauri()) {
		try {
			return await invokeTauri<BlockerAddressList>(
				'server_blocker_fetch',
				{ region }
			)
		} catch {
			/* Падаем на прямой fetch ниже. */
		}
	}
	const res = await fetch(REGION_URL[region])
	if (!res.ok) throw new Error(`HTTP ${res.status}`)
	return (await res.json()) as BlockerAddressList
}

export async function pingBlockerServers(
	addresses: string[],
	timeoutMs = 3000,
	attempts = 2
): Promise<BlockerPing[]> {
	const raw = await invokeTauri<
		{
			address: string
			ok: boolean
			avgMs?: number | null
			minMs?: number | null
			attempts: number
			success: number
		}[]
	>('server_blocker_ping', { addresses, timeoutMs, attempts })
	return raw.map((r) => ({
		address: r.address,
		ok: r.ok,
		avgMs: r.avgMs ?? null,
		minMs: r.minMs ?? null,
		attempts: r.attempts,
		success: r.success,
	}))
}

export async function getBlockerStatus(): Promise<BlockerFirewallStatus> {
	const raw = await invokeTauri<{
		admin: boolean
		ruleExists: boolean
		blockedIps: string[]
		supported: boolean
	}>('server_blocker_status')
	return {
		admin: raw.admin,
		ruleExists: raw.ruleExists,
		blockedIps: raw.blockedIps ?? [],
		supported: raw.supported,
	}
}

export async function applyBlockerRule(
	blockedAddresses: string[]
): Promise<string> {
	return invokeTauri<string>('server_blocker_apply', { blockedAddresses })
}

export async function clearBlockerRule(): Promise<string> {
	return invokeTauri<string>('server_blocker_clear')
}

export async function restartElevated(): Promise<string> {
	return invokeTauri<string>('server_blocker_restart_elevated')
}

export function stripPort(address: string): string {
	const idx = address.lastIndexOf(':')
	return idx > 0 ? address.slice(0, idx) : address
}
