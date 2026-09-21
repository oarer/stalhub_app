'use client'

import { Icon } from '@iconify/react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import type { ItemListing } from '@/types/api.type'
import type { MatchedRow } from './trading'

export type CopyState = 'copy' | 'copied' | 'copyError'

export function DebugCard({
	json,
	raw,
	items,
	loading,
	catalogError,
	copyState,
	onCopy,
	rows,
}: {
	json: string
	raw: string
	items: ItemListing[] | null
	loading: boolean
	catalogError: boolean
	copyState: CopyState
	onCopy: () => void
	rows: MatchedRow[]
}) {
	const t = useTranslations('trading')

	return (
		<Card.Root className="min-w-0 gap-4">
			<div className="flex items-center justify-between gap-2">
				<Card.Title>
					<Icon className="text-primary" icon="lucide:file-code-2" />
					{t('result')}
				</Card.Title>
				<Button onClick={onCopy} variant="secondary">
					<Icon icon="lucide:clipboard" />
					{t(copyState)}
				</Button>
			</div>
			<p className="text-muted-foreground text-sm">{t('snapshot')}</p>
			{loading && !items?.length && (
				<p
					className="flex items-center gap-2 font-semibold text-text-accent"
					role="status"
				>
					<Skeleton className="size-4" />
					{t('loadingCatalog')}
				</p>
			)}
			{(catalogError || (!loading && !items?.length)) && (
				<p className="text-red-500" role="alert">
					{t('catalogError')}
				</p>
			)}
			{!rows.length && (
				<p className="text-muted-foreground text-sm">{t('empty')}</p>
			)}
			<pre
				className="max-h-96 overflow-auto rounded-xl bg-background p-4 text-xs"
				data-testid="trading-json"
			>
				{json}
			</pre>
			<details>
				<summary className="cursor-pointer text-sm">{t('raw')}</summary>
				<pre className="max-h-64 overflow-auto whitespace-pre-wrap p-2 text-xs">
					{raw}
				</pre>
			</details>
		</Card.Root>
	)
}
