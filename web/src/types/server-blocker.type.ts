export interface BlockerTunnel {
	name: string
	address: string
}

export interface BlockerPool {
	name: string
	tunnels: BlockerTunnel[]
}

export interface BlockerAddressList {
	mode?: string | null
	pools: BlockerPool[]
}

export interface BlockerPing {
	address: string
	ok: boolean
	avgMs?: number | null
	minMs?: number | null
	attempts: number
	success: number
}

export interface BlockerFirewallStatus {
	admin: boolean
	ruleExists: boolean
	blockedIps: string[]
	supported: boolean
}

export type BlockerRegion = 'RU' | 'NEA' | 'SEA' | 'EU' | 'NA'

export const BLOCKER_REGIONS: BlockerRegion[] = ['RU', 'EU', 'NA', 'NEA', 'SEA']
