'use client'

import { Icon } from '@iconify/react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { mtsExtended } from '@/app/fonts'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { CheckBox } from '@/components/ui/CheckBox'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tabs } from '@/components/ui/Tabs'
import { toast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { isTauri } from '@/lib/tauri-bridge'
import {
	applyBlockerRule,
	clearBlockerRule,
	fetchBlockerServers,
	getBlockerStatus,
	pingBlockerServers,
	restartElevated,
} from '@/services/server-blocker/server-blocker.service'
import type {
	BlockerFirewallStatus,
	BlockerPing,
	BlockerPool,
	BlockerRegion,
} from '@/types/server-blocker.type'
import { BLOCKER_REGIONS } from '@/types/server-blocker.type'
import {
	BLOCKER_REGION_LABEL_KEYS,
	formatPing,
	pingTone,
} from '@/views/server-blocker/server-blocker.const'

const ServerBlockerGlobe = dynamic(
	() => import('@/views/server-blocker/components/ServerBlockerGlobe'),
	{
		ssr: false,
		loading: () => <Skeleton className="h-85 w-full rounded-xl" />,
	}
)
const KEEP_OPTIONS = [1, 2, 3, 5, 10]

export default function ServerBlockerView() {
	const t = useTranslations()
	const [desktop, setDesktop] = useState(false)
	const [region, setRegion] = useState<BlockerRegion>('RU')
	const [pools, setPools] = useState<BlockerPool[]>([])
	const [loading, setLoading] = useState(false)
	const [pinging, setPinging] = useState(false)
	const [pingByAddress, setPingByAddress] = useState<
		Map<string, BlockerPing>
	>(new Map())
	const [allowed, setAllowed] = useState<Set<string>>(new Set())
	const [keepCount, setKeepCount] = useState(3)
	const [fwStatus, setFwStatus] = useState<BlockerFirewallStatus | null>(null)
	const [applying, setApplying] = useState(false)

	useEffect(() => {
		setDesktop(isTauri())
		if (isTauri()) {
			getBlockerStatus()
				.then(setFwStatus)
				.catch(() => null)
		}
	}, [])

	const allAddresses = useMemo(
		() => pools.flatMap((p) => p.tunnels.map((t) => t.address)),
		[pools]
	)

	const loadRegion = useCallback(
		async (r: BlockerRegion) => {
			setLoading(true)
			try {
				const list = await fetchBlockerServers(r)
				setPools(list.pools ?? [])
				setPingByAddress(new Map())
				setAllowed(
					new Set(
						(list.pools ?? []).flatMap((p) =>
							p.tunnels.map((t) => t.address)
						)
					)
				)
			} catch (e) {
				toast.error(
					t('serverBlocker.toasts.loadFailed', {
						error: e instanceof Error ? e.message : String(e),
					})
				)
				setPools([])
			} finally {
				setLoading(false)
			}
		},
		[t]
	)

	useEffect(() => {
		void loadRegion(region)
	}, [region, loadRegion])

	const handlePing = useCallback(async () => {
		if (!desktop) {
			toast.error(t('serverBlocker.toasts.pingDesktopOnly'))
			return
		}
		if (allAddresses.length === 0) return
		setPinging(true)
		try {
			const results = await pingBlockerServers(allAddresses, 3000, 2)
			const map = new Map(results.map((r) => [r.address, r]))
			setPingByAddress(map)
			// Автовыбор: N лучших по avgMs.
			const sorted = [...results]
				.filter((r) => r.ok)
				.sort((a, b) => (a.avgMs ?? 99999) - (b.avgMs ?? 99999))
			const keep = new Set(
				sorted.slice(0, keepCount).map((r) => r.address)
			)
			// Если вообще ничего не пингуется — оставляем всё, чтобы не заблокировать игру полностью.
			setAllowed(sorted.length > 0 ? keep : new Set(allAddresses))
			const unreachable = results.filter((r) => !r.ok).length
			toast.success(
				sorted.length > 0
					? t('serverBlocker.toasts.pingResult', {
							total: results.length,
							unreachable,
							kept: Math.min(keepCount, sorted.length),
						})
					: t('serverBlocker.toasts.pingNoResponse')
			)
		} catch (e) {
			toast.error(
				t('serverBlocker.toasts.pingError', {
					error: e instanceof Error ? e.message : String(e),
				})
			)
		} finally {
			setPinging(false)
		}
	}, [allAddresses, desktop, keepCount, t])

	const toggleTunnel = (address: string) => {
		setAllowed((prev) => {
			const next = new Set(prev)
			if (next.has(address)) next.delete(address)
			else next.add(address)
			return next
		})
	}

	const togglePool = (pool: BlockerPool) => {
		setAllowed((prev) => {
			const next = new Set(prev)
			const allIn = pool.tunnels.every((t) => next.has(t.address))
			if (allIn) pool.tunnels.forEach((t) => next.delete(t.address))
			else pool.tunnels.forEach((t) => next.add(t.address))
			return next
		})
	}

	const blockedAddresses = useMemo(
		() => allAddresses.filter((a) => !allowed.has(a)),
		[allAddresses, allowed]
	)

	const handleApply = async () => {
		if (!desktop) {
			toast.error(t('serverBlocker.toasts.blockDesktopOnly'))
			return
		}
		if (allowed.size === 0) {
			toast.error(t('serverBlocker.toasts.cannotBlockAll'))
			return
		}
		setApplying(true)
		try {
			const msg = await applyBlockerRule(blockedAddresses)
			toast.success(msg)
			const st = await getBlockerStatus().catch(() => null)
			if (st) setFwStatus(st)
		} catch (e) {
			toast.error(`${e instanceof Error ? e.message : e}`)
		} finally {
			setApplying(false)
		}
	}

	const handleClear = async () => {
		setApplying(true)
		try {
			const msg = await clearBlockerRule()
			toast.success(msg)
			const st = await getBlockerStatus().catch(() => null)
			if (st) setFwStatus(st)
		} catch (e) {
			toast.error(`${e instanceof Error ? e.message : e}`)
		} finally {
			setApplying(false)
		}
	}

	const handleElevated = async () => {
		try {
			const msg = await restartElevated()
			toast.info(msg)
		} catch (e) {
			toast.error(`${e instanceof Error ? e.message : e}`)
		}
	}

	return (
		<section className="mx-auto max-w-380 space-y-6 px-4 pt-32 pb-12 sm:px-6">
			<h1
				className={`${mtsExtended.className} font-semibold text-[28px] leading-none`}
			>
				{t('serverBlocker.title')}
			</h1>

			{!desktop && (
				<div className="flex items-start gap-3 rounded-xl bg-warning/10 px-5 py-4 text-sm ring-2 ring-warning/40">
					<Icon
						className="mt-0.5 shrink-0 text-lg text-warning"
						icon="lucide:triangle-alert"
					/>
					<p>
						{t.rich('serverBlocker.browserWarning', {
							b: (chunks) => <b>{chunks}</b>,
						})}
					</p>
				</div>
			)}

			{desktop && fwStatus && !fwStatus.supported && (
				<div className="flex items-start gap-3 rounded-xl bg-destructive/10 px-5 py-4 text-sm ring-2 ring-destructive/40">
					<Icon
						className="mt-0.5 shrink-0 text-destructive text-lg"
						icon="lucide:ban"
					/>
					<p>{t('serverBlocker.windowsOnly')}</p>
				</div>
			)}

			{desktop && fwStatus?.supported && !fwStatus.admin && (
				<div className="flex flex-wrap items-center gap-3 rounded-xl bg-warning/10 px-5 py-4 text-sm ring-2 ring-warning/40">
					<Icon
						className="shrink-0 text-lg text-warning"
						icon="lucide:shield-alert"
					/>
					<p className="min-w-52 flex-1">
						{t.rich('serverBlocker.noAdmin', {
							b: (chunks) => <b>{chunks}</b>,
						})}
					</p>
					<Button
						onClick={handleElevated}
						size="sm"
						variant="primary"
					>
						<Icon className="text-base" icon="lucide:shield-half" />
						{t('serverBlocker.restartAsAdmin')}
					</Button>
				</div>
			)}

			{desktop && fwStatus?.supported && (
				<div className="flex flex-wrap items-center gap-2 rounded-xl bg-card px-5 py-3 text-sm shadow-lg ring-2 ring-primary/50 md:bg-card/50 md:backdrop-blur-md">
					<Icon
						className="text-lg text-primary"
						icon="lucide:shield-check"
					/>
					<Badge
						variant={fwStatus.ruleExists ? 'danger' : 'secondary'}
					>
						{fwStatus.ruleExists
							? t('serverBlocker.ruleActive', {
									count: fwStatus.blockedIps.length,
								})
							: t('serverBlocker.noRules')}
					</Badge>
					<Badge variant={fwStatus.admin ? 'success' : 'secondary'}>
						{fwStatus.admin
							? t('serverBlocker.runningAsAdmin')
							: t('serverBlocker.withoutAdmin')}
					</Badge>
					{fwStatus.ruleExists && (
						<Button
							className="gap-2"
							disabled={applying}
							onClick={handleClear}
							size="sm"
							variant="ghost"
						>
							<Icon className="text-base" icon="lucide:trash-2" />
							{t('serverBlocker.clearAll')}
						</Button>
					)}
				</div>
			)}

			<div className="flex flex-wrap items-center gap-3 rounded-xl bg-card px-5 py-4 shadow-lg ring-2 ring-primary/50 md:bg-card/50 md:backdrop-blur-md">
				<Tabs.Root
					onValueChange={(v) => setRegion(v as BlockerRegion)}
					value={region}
				>
					<Tabs.List className="ring-2 ring-primary/30">
						{BLOCKER_REGIONS.map((r) => (
							<Tabs.Trigger key={r} value={r}>
								{r}
							</Tabs.Trigger>
						))}
					</Tabs.List>
				</Tabs.Root>
				<span className="text-muted-foreground text-sm">
					{t(BLOCKER_REGION_LABEL_KEYS[region])}
				</span>
				<div className="ml-auto flex flex-wrap items-center gap-2">
					<div className="flex items-center gap-1.5 text-sm">
						<span className="text-muted-foreground">
							{t('serverBlocker.keepLabel')}
						</span>
						{KEEP_OPTIONS.map((n) => (
							<button
								className={cn(
									'cursor-pointer rounded-lg px-2.5 py-1 font-mono font-semibold transition-colors',
									keepCount === n
										? 'bg-primary text-primary-foreground'
										: 'bg-muted/60 text-muted-foreground hover:bg-muted'
								)}
								key={n}
								onClick={() => setKeepCount(n)}
								type="button"
							>
								{n}
							</button>
						))}
					</div>
					<Button
						className="gap-2"
						disabled={pinging || loading}
						loading={pinging}
						onClick={handlePing}
						variant="primary"
					>
						<Icon className="text-base" icon="lucide:radar" />
						{t('serverBlocker.checkPing')}
					</Button>
				</div>
			</div>

			{pools.length > 0 && (
				<div className="overflow-hidden rounded-xl bg-card shadow-lg ring-2 ring-primary/50 md:bg-card/50 md:backdrop-blur-md">
					<div className="px-5 pt-4 pb-2 text-muted-foreground text-sm">
						{t('serverBlocker.globeLegend')}
					</div>
					<div className="px-3 pb-3">
						<ServerBlockerGlobe
							allowed={allowed}
							onTogglePool={togglePool}
							pingByAddress={pingByAddress}
							pools={pools}
							region={region}
						/>
					</div>
				</div>
			)}

			<div className="flex flex-wrap items-center gap-3 rounded-xl bg-card px-5 py-4 shadow-lg ring-2 ring-primary/50 md:bg-card/50 md:backdrop-blur-md">
				<div className="flex items-center gap-2 text-sm">
					<Icon
						className="text-lg text-success"
						icon="lucide:check-circle-2"
					/>
					<span>
						{t('serverBlocker.kept')}{' '}
						<b className="font-mono">{allowed.size}</b>
					</span>
				</div>
				<div className="flex items-center gap-2 text-sm">
					<Icon
						className="text-destructive text-lg"
						icon="lucide:ban"
					/>
					<span>
						{t('serverBlocker.toBlock')}{' '}
						<b className="font-mono">{blockedAddresses.length}</b>
					</span>
				</div>
				<div className="ml-auto flex gap-2">
					<Button
						className="gap-2"
						disabled={applying || allowed.size === 0}
						loading={applying}
						onClick={handleApply}
						variant="primary"
					>
						<Icon className="text-base" icon="lucide:shield" />
						{t('serverBlocker.blockRest')}
					</Button>
				</div>
			</div>

			{loading ? (
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<Skeleton className="h-48 w-full" />
					<Skeleton className="h-48 w-full" />
				</div>
			) : (
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					{pools.map((pool) => {
						const pings = pool.tunnels
							.map(
								(t) =>
									pingByAddress.get(t.address)?.avgMs ?? null
							)
							.filter((v): v is number => v != null)
						const best = pings.length ? Math.min(...pings) : null
						const allowedInPool = pool.tunnels.filter((t) =>
							allowed.has(t.address)
						).length
						const fullyBlocked = allowedInPool === 0
						const partially =
							allowedInPool > 0 &&
							allowedInPool < pool.tunnels.length
						return (
							<div
								className={cn(
									'flex flex-col gap-2 rounded-xl bg-card px-5 py-4 shadow-lg ring-2 md:bg-card/50 md:backdrop-blur-md',
									fullyBlocked
										? 'ring-destructive/50'
										: partially
											? 'ring-warning/40'
											: 'ring-primary/50'
								)}
								key={pool.name}
							>
								<div className="flex items-center gap-2">
									<button
										className="flex cursor-pointer items-center gap-2"
										onClick={() => togglePool(pool)}
										title={t('serverBlocker.selectPool')}
										type="button"
									>
										<Icon
											className={cn(
												'text-xl',
												fullyBlocked
													? 'text-destructive'
													: 'text-success'
											)}
											icon={
												fullyBlocked
													? 'lucide:ban'
													: 'lucide:server'
											}
										/>
										<h2 className="font-mono font-semibold text-lg">
											{pool.name}
										</h2>
									</button>
									<span
										className={cn(
											'ml-auto font-mono font-semibold text-sm',
											pingTone(best)
										)}
									>
										{best != null
											? `${best} ms`
											: pingByAddress.size > 0
												? t('serverBlocker.noResponse')
												: '—'}
									</span>
									<Badge
										variant={
											fullyBlocked
												? 'danger'
												: partially
													? 'secondary'
													: 'success'
										}
									>
										{allowedInPool}/{pool.tunnels.length}
									</Badge>
								</div>
								<div className="flex flex-col gap-1.5">
									{pool.tunnels.map((t) => {
										const ping = pingByAddress.get(
											t.address
										)
										const isAllowed = allowed.has(t.address)
										return (
											<div
												className={cn(
													'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors',
													isAllowed
														? 'bg-success/10 hover:bg-success/20'
														: 'bg-destructive/10 hover:bg-destructive/20'
												)}
												key={t.address}
											>
												<CheckBox
													checked={isAllowed}
													onCheckedChange={() =>
														toggleTunnel(t.address)
													}
												/>
												<button
													className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 text-left font-semibold"
													onClick={() =>
														toggleTunnel(t.address)
													}
													type="button"
												>
													<span className="min-w-0 flex-1 truncate font-mono text-[13px]">
														{t.name}{' '}
														<span className="text-muted-foreground">
															{t.address}
														</span>
													</span>
													<span
														className={cn(
															'shrink-0 font-mono font-semibold text-[13px]',
															pingTone(
																ping?.avgMs
															)
														)}
													>
														{ping
															? formatPing(
																	ping.avgMs
																)
															: '—'}
													</span>
												</button>
											</div>
										)
									})}
								</div>
							</div>
						)
					})}
				</div>
			)}

			{!loading && pools.length === 0 && (
				<p className="text-center text-muted-foreground text-sm">
					{t('serverBlocker.loadFailed')}
				</p>
			)}
		</section>
	)
}
