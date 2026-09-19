'use client'

import { Icon } from '@iconify/react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'
import { GITHUB_RAW_BASE } from '@/constants/github.const'
import { getLocale } from '@/lib/getLocale'
import { buyItemKey } from '@/stores/useBuy.store'
import type { ItemListing } from '@/types/api.type'
import { infoColorMap } from '@/types/item.type'
import ItemPickerModal from '@/views/calcs/buy/components/ItemPickerModal'
import {
	parseAmount,
	tradePartialTotal,
	tradeTotal,
	validatePrices,
} from './pricing'
import { itemCatalogId, type MatchedRow } from './trading'

const PRICES_KEY = 'trading-prices-v1'

type ResultKind = 'none' | 'ready' | 'matched' | 'mismatch' | 'partial'

export function TradePrices({
	items,
	rows,
	player,
	amount,
}: {
	items: ItemListing[]
	rows: MatchedRow[]
	player: string
	amount: string
}) {
	const t = useTranslations('trading')
	const locale = getLocale()
	const format = useCallback(
		(value: number | null): string =>
			value === null ? '—' : value.toLocaleString(locale),
		[locale]
	)

	const notify = useCallback(
		(body: string) => {
			const nativeSupported =
				typeof Notification !== 'undefined' &&
				Notification.permission === 'granted'

			if (nativeSupported) {
				try {
					const notification = new Notification(t('title'), {
						body,
						tag: 'trade-total',
					})
					notification.onclick = () => {
						window.focus()
						notification.close()
					}
					return
				} catch {
					/* Fall through — the native call failed on this platform. */
				}
			}

			toast.info(body, { id: 'trade-total', duration: 6000 })
		},
		[t]
	)

	const [prices, setPrices] = useState<Record<string, number>>({})
	const [pickerOpen, setPickerOpen] = useState(false)
	const [storageError, setStorageError] = useState(false)

	useEffect(() => {
		try {
			setPrices(
				validatePrices(
					JSON.parse(localStorage.getItem(PRICES_KEY) ?? '{}')
				)
			)
		} catch {
			setStorageError(true)
		}
	}, [])

	useEffect(() => {
		if (typeof Notification === 'undefined') return
		if (Notification.permission === 'default') {
			Notification.requestPermission().catch(() => {
				/* Permission prompt may be unavailable (e.g. headless). */
			})
		}
	}, [])

	const save = useCallback((next: Record<string, number>) => {
		setPrices(next)
		try {
			localStorage.setItem(PRICES_KEY, JSON.stringify(next))
			setStorageError(false)
		} catch {
			setStorageError(true)
		}
	}, [])

	const itemMap = useMemo(() => {
		const map = new Map<string, ItemListing>()
		for (const item of items) {
			const id = itemCatalogId(item.data)
			if (id) map.set(id, item)
		}
		return map
	}, [items])

	const knownIds = useMemo(() => Object.keys(prices), [prices])

	const addedKeys = useMemo(() => {
		const set = new Set<string>()
		for (const id of knownIds) {
			const item = itemMap.get(id)
			if (item) set.add(buyItemKey(item))
		}
		return set
	}, [knownIds, itemMap])

	const offered = parseAmount(amount)
	const expected = tradeTotal(rows, prices)
	const partial = tradePartialTotal(rows, prices)
	const total = expected ?? partial
	const unpricedRows = rows.filter(
		(row) => row.id && !Object.hasOwn(prices, row.id)
	)
	const unmatchedRows = rows.filter((row) => !row.id)
	const joinNames = (entries: MatchedRow[]) =>
		entries.map((entry) => entry.name).join(', ')

	const kind: ResultKind =
		total === null
			? 'none'
			: offered === null
				? expected === null
					? 'partial'
					: 'ready'
				: offered === total
					? expected === null
						? 'partial'
						: 'matched'
					: 'mismatch'

	const lastSignature = useRef<string | null>(null)
	useEffect(() => {
		if (kind === 'none') return
		const signature = `${kind}|${total}|${offered ?? ''}`
		if (lastSignature.current === signature) return
		lastSignature.current = signature

		const message =
			kind === 'matched'
				? `${t('matched')} · ${format(total)}`
				: kind === 'mismatch'
					? t('mismatch', {
							expected: format(total),
							offered: format(offered),
						})
					: kind === 'partial'
						? t('notifyPartial', { total: format(total) })
						: t('notifyTotal', { total: format(total) })

		if (kind === 'matched') {
			notify(message)
		} else if (kind === 'mismatch') {
			notify(message)
		} else {
			notify(message)
		}
	}, [format, kind, notify, offered, t, total])

	const handleAdd = useCallback(
		(item: ItemListing) => {
			const id = itemCatalogId(item.data)
			if (!id || Object.hasOwn(prices, id)) return
			save({ ...prices, [id]: 0 })
			toast.success(t('priceAdded'))
		},
		[prices, save, t]
	)

	const handlePriceChange = useCallback(
		(id: string, raw: string) => {
			if (raw === '') {
				save({ ...prices, [id]: 0 })
				return
			}
			const num = Number(raw)
			if (Number.isNaN(num) || num < 0) return
			save({ ...prices, [id]: Math.round(num) })
		},
		[prices, save]
	)

	const handleRemove = useCallback(
		(id: string) => {
			const next = { ...prices }
			delete next[id]
			save(next)
		},
		[prices, save]
	)

	return (
		<Card.Root className="gap-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<Card.Title>
					<Icon
						className="text-lg text-primary"
						icon="lucide:coins"
					/>
					{t('prices')}
				</Card.Title>
				<Button
					className="flex items-center gap-2 font-semibold"
					onClick={() => setPickerOpen(true)}
					variant="primary"
				>
					<Icon icon="lucide:plus" />
					{t('addPriceItem')}
				</Button>
			</div>

			<div className="flex flex-col gap-2">
				<p className="text-muted-foreground text-sm">
					{t('player')}: {player.trim() || '—'}
				</p>
				{offered !== null && (
					<p className="text-muted-foreground text-sm">
						{t('amount')}: {format(offered)}
					</p>
				)}
			</div>

			<div className="rounded-lg bg-primary/10 p-5">
				<p className="text-muted-foreground text-sm">
					{t('totalPrice')}
				</p>
				<p
					aria-live="polite"
					className="font-bold text-4xl tabular-nums"
					data-testid="trade-total"
				>
					{total === null ? '—' : format(total)}
				</p>
			</div>

			<div className="flex flex-col gap-2">
				{!rows.length ? (
					<p className="text-muted-foreground text-sm">
						{t('empty')}
					</p>
				) : total === null ? (
					<>
						<p className="text-muted-foreground text-sm">
							{t('incomplete')}
						</p>
						{unpricedRows.length > 0 && (
							<p className="text-sm" role="alert">
								{t('unpricedRows', {
									items: joinNames(unpricedRows),
								})}
							</p>
						)}
						{unmatchedRows.length > 0 && (
							<p className="text-muted-foreground text-sm">
								{t('unmatchedRows', {
									items: joinNames(unmatchedRows),
								})}
							</p>
						)}
					</>
				) : (
					<>
						{expected === null && (
							<p className="text-muted-foreground text-sm">
								{t('partialTotal')}
							</p>
						)}
						{offered === null ? (
							<p className="text-muted-foreground text-sm">
								{t('unreadableAmount')}
							</p>
						) : offered === total ? (
							<p
								className="font-semibold text-green-500"
								data-testid="trade-match"
							>
								{t('matched')}
							</p>
						) : (
							<p
								className="font-semibold text-red-500"
								data-testid="trade-mismatch"
								role="alert"
							>
								{t('mismatch', {
									expected: format(total),
									offered: format(offered),
								})}
							</p>
						)}
					</>
				)}
			</div>

			<div className="flex flex-col gap-3">
				<div className="overflow-hidden rounded-xl ring-2 ring-primary/50">
					<div className="grid grid-cols-[2.5rem_1fr_3rem] items-center gap-x-3 border-primary/50 border-b-2 bg-card/80 px-3 py-2 sm:grid-cols-[3rem_1fr_12rem_3rem] sm:gap-x-4 sm:px-4">
						<p className="font-bold text-text-accent text-xs uppercase">
							№
						</p>
						<p className="font-bold text-text-accent text-xs uppercase">
							{t('itemName')}
						</p>
						<p className="font-bold text-text-accent text-xs uppercase sm:text-right">
							{t('unitPriceShort')}
						</p>
						<p className="hidden sm:block" />
					</div>

					{knownIds.length === 0 ? (
						<div className="flex flex-col items-center gap-2 px-4 py-8">
							<Icon
								className="text-3xl text-muted-foreground"
								icon="lucide:package-search"
							/>
							<p className="font-semibold text-text-accent">
								{t('emptyPrices')}
							</p>
						</div>
					) : (
						knownIds.map((id, index) => {
							const item = itemMap.get(id)
							const name = item?.name?.[locale] ?? id
							const color = item
								? infoColorMap[item.color]
								: undefined

							return (
								<div
									className="grid grid-cols-[2.5rem_1fr_3rem] items-center gap-x-3 gap-y-2 border-primary/20 border-b bg-card/30 px-3 py-2 transition-colors last:border-b-0 hover:bg-card/60 sm:grid-cols-[3rem_1fr_12rem_3rem] sm:gap-x-4 sm:gap-y-0 sm:px-4"
									key={id}
								>
									<p className="font-semibold text-sm text-text-accent">
										{index + 1}
									</p>
									<div className="flex min-w-0 items-center gap-2 sm:gap-3">
										{item?.icon ? (
											<Image
												alt={name}
												className="size-8 shrink-0 object-contain"
												height={32}
												loading="lazy"
												src={`${GITHUB_RAW_BASE}${item.icon}`}
												width={32}
											/>
										) : (
											<span className="flex size-8 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
												<Icon icon="lucide:package" />
											</span>
										)}
										<p
											className="truncate font-semibold text-sm"
											style={
												color ? { color } : undefined
											}
										>
											{name}
										</p>
									</div>
									<Input
										className="text-right"
										min={0}
										onChange={(event) =>
											handlePriceChange(
												id,
												event.target.value
											)
										}
										step={1}
										type="number"
										value={String(prices[id] ?? '')}
									/>
									<Button
										aria-label={t('removePrice')}
										className="col-start-3 row-start-1 sm:col-start-4"
										onClick={() => handleRemove(id)}
										size="sm"
										variant="danger"
									>
										<Icon icon="lucide:x" />
									</Button>
								</div>
							)
						})
					)}
				</div>

				<p className="text-muted-foreground text-xs">
					{t('pricesLocal')}
				</p>
				{storageError && (
					<p className="text-red-500" role="alert">
						{t('storageError')}
					</p>
				)}
			</div>

			<ItemPickerModal
				addedKeys={addedKeys}
				onAdd={handleAdd}
				onOpenChange={setPickerOpen}
				open={pickerOpen}
			/>
		</Card.Root>
	)
}
