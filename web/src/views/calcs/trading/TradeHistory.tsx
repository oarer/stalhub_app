'use client'

import { Icon } from '@iconify/react'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { montserrat } from '@/app/fonts'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { formatDate } from '@/lib/date'
import {
	type TradeDeal,
	useTradingHistoryStore,
} from '@/stores/useTradingHistory.store'

function DealSummary({ deal, locale }: { deal: TradeDeal; locale: string }) {
	const t = useTranslations('trading')
	const format = useMemo(
		() => ({
			time: new Intl.DateTimeFormat(locale, {
				hour: '2-digit',
				minute: '2-digit',
			}),
			date: new Intl.DateTimeFormat(locale, {
				day: '2-digit',
				month: '2-digit',
				year: '2-digit',
			}),
			number: (value: number | null) =>
				value === null ? '—' : value.toLocaleString(locale),
		}),
		[locale]
	)
	const automatic = deal.reason === 'success'
	return (
		<div className="flex items-center gap-3 rounded-lg bg-card/30 px-3 py-2 ring-1 ring-primary/20">
			<span
				className={`flex shrink-0 items-center justify-center rounded-full p-1.5 ${automatic ? 'bg-success/15 text-success' : 'bg-info/15 text-info'}`}
			>
				<Icon
					icon={
						automatic ? 'lucide:circle-check' : 'lucide:handshake'
					}
				/>
			</span>
			<div className="min-w-0 flex-1">
				<p className="truncate font-semibold text-sm">
					{deal.player.trim() || '—'}
				</p>
				<p
					className={`${montserrat.className} truncate font-semibold text-muted-foreground text-xs`}
				>
					{deal.items.length > 0
						? deal.items
								.map((row) => `${row.name} ×${row.count}`)
								.join(', ')
						: t('overlayEmpty')}
				</p>
			</div>
			<div className="shrink-0 text-right">
				<p
					className={`${montserrat.className} font-bold text-sm tabular-nums`}
				>
					{format.number(deal.total)}
				</p>
				<p
					className={`${montserrat.className} font-semibold text-muted-foreground text-xs`}
				>
					{formatDate(deal.completedAt)}
				</p>
			</div>
		</div>
	)
}

export function TradeHistory() {
	const t = useTranslations('trading')
	const locale = useLocale()
	const deals = useTradingHistoryStore((s) => s.deals)
	const clearDeals = useTradingHistoryStore((s) => s.clearDeals)

	return (
		<Card.Root className="gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<Card.Title>
					<Icon
						className="text-lg text-primary"
						icon="lucide:history"
					/>
					{t('historyTitle')}
				</Card.Title>
				<Button
					className="gap-2"
					disabled={deals.length === 0}
					onClick={clearDeals}
					size="sm"
					variant="ghost"
				>
					<Icon icon="lucide:trash-2" />
					{t('historyClear')}
				</Button>
			</div>
			{deals.length === 0 ? (
				<div className="flex flex-col items-center gap-2 px-4 py-8">
					<Icon
						className="text-3xl text-muted-foreground"
						icon="lucide:inbox"
					/>
					<p className="font-semibold text-text-accent">
						{t('historyEmpty')}
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-2">
					{deals.map((deal) => (
						<DealSummary
							deal={deal}
							key={deal.id}
							locale={locale}
						/>
					))}
				</div>
			)}
		</Card.Root>
	)
}
