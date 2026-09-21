'use client'

import { Icon } from '@iconify/react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { montserrat } from '@/app/fonts'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'
import { GITHUB_RAW_BASE } from '@/constants/github.const'
import { getLocale } from '@/lib/getLocale'
import { buyItemKey } from '@/stores/useBuy.store'
import {
	useTradingPricesStore,
} from '@/stores/useTradingPrices.store'
import type { ItemListing } from '@/types/api.type'
import { infoColorMap } from '@/types/item.type'
import ItemPickerModal from '@/views/calcs/buy/components/ItemPickerModal'
import { tradePartialTotal, tradeTotal } from './pricing'
import { itemCatalogId, type MatchedRow } from './trading'

export function TradePrices({
	items,
	rows,
	player,
}: {
	items: ItemListing[]
	rows: MatchedRow[]
	player: string
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

	const prices = useTradingPricesStore((s) => s.prices)
	const addPriceItem = useTradingPricesStore((s) => s.addItem)
	const setPrice = useTradingPricesStore((s) => s.setPrice)
	const removePriceItem = useTradingPricesStore((s) => s.removeItem)
	const [pickerOpen, setPickerOpen] = useState(false)

	useEffect(() => {
		if (typeof Notification === 'undefined') return
		if (Notification.permission === 'default') {
			Notification.requestPermission().catch(() => {
				/* Permission prompt may be unavailable (e.g. headless). */
			})
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

	const expected = tradeTotal(rows, prices)
	const partial = tradePartialTotal(rows, prices)
	const total = expected ?? partial

	const lastTotal = useRef<number | null>(null)
	useEffect(() => {
		if (total === null || lastTotal.current === total) return
		lastTotal.current = total
		notify(
			expected === null
				? t('notifyPartial', { total: format(total) })
				: t('notifyTotal', { total: format(total) })
		)
	}, [expected, format, notify, t, total])

	const handleAdd = useCallback(
		(item: ItemListing) => {
			const id = itemCatalogId(item.data)
			if (!id || Object.hasOwn(prices, id)) return
			addPriceItem(id)
			toast.success(t('priceAdded'))
		},
		[addPriceItem, prices, t]
	)

	const handlePriceChange = useCallback(
		(id: string, raw: string) => {
			if (raw === '') {
				setPrice(id, 0)
				return
			}
			const num = Number(raw)
			if (Number.isNaN(num) || num < 0) return
			setPrice(id, Math.round(num))
		},
		[setPrice]
	)

	const handleRemove = useCallback(
		(id: string) => {
			removePriceItem(id)
		},
		[removePriceItem]
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


			<div className="rounded-lg bg-primary/10 p-5">
				<p className="font-semibold text-muted-foreground text-sm">
					{t('totalPrice')}
				</p>
				<p
					aria-live="polite"
					className={`${montserrat.className} font-bold text-3xl tabular-nums`}
				>
					{total === null ? '—' : format(total)}
				</p>
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
