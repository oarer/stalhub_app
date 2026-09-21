'use client'

import { Icon } from '@iconify/react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { montserrat } from '@/app/fonts'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { toast } from '@/components/ui/Toast'
import {
	applyLocalData,
	decodeImportToken,
	onLocalDataImport,
	parseImportUrl,
} from '@/lib/localData'

type ImportStatus =
	| 'idle'
	| 'decoding'
	| 'ready'
	| 'applying'
	| 'invalid'
	| 'error'

export default function ImportDeeplinkHandler() {
	const t = useTranslations()

	const [status, setStatus] = useState<ImportStatus>('idle')
	const [data, setData] = useState<Record<string, string> | null>(null)

	const idleRef = useRef(true)
	const lastSeenRef = useRef<{ url: string; at: number } | null>(null)

	const handleUrl = useCallback(
		(url: string) => {
			const now = Date.now()
			if (
				lastSeenRef.current &&
				lastSeenRef.current.url === url &&
				now - lastSeenRef.current.at < 2000
			)
				return
			lastSeenRef.current = { url, at: now }

			if (!idleRef.current) return
			idleRef.current = false

			const token = parseImportUrl(url)
			if (!token) {
				idleRef.current = true
				toast.error(t('import.invalid'))
				return
			}

			setStatus('decoding')
			void decodeImportToken(token).then((result) => {
				if (result.ok) {
					setData(result.data)
					setStatus('ready')
				} else {
					idleRef.current = true
					if (result.reason === 'unsupported')
						toast.error(t('import.unsupported'))
					else toast.error(t('import.invalid'))
				}
			})
		},
		[t]
	)

	useEffect(() => {
		const unsubscribe = onLocalDataImport(handleUrl)
		return unsubscribe
	}, [handleUrl])

	const handleCancel = useCallback(() => {
		setStatus('idle')
		setData(null)
		idleRef.current = true
	}, [])

	const handleConfirm = useCallback(() => {
		if (!data || status !== 'ready') return
		setStatus('applying')
		let applied = 0
		try {
			applied = applyLocalData(data)
		} catch {
			setStatus('idle')
			setData(null)
			idleRef.current = true
			toast.error(t('import.error'))
			return
		}
		setStatus('idle')
		setData(null)
		idleRef.current = true
		toast.success(t('import.success', { count: applied }))

		window.setTimeout(() => window.location.reload(), 600)
	}, [data, status, t])

	const open = status === 'ready' || status === 'applying'
	const entriesCount = data ? Object.keys(data).length : 0

	return (
		<Modal.Root
			onOpenChange={(open) => !open && handleCancel()}
			open={open}
		>
			<Modal.Content className="max-w-2xl" fullScreen={false}>
				<Modal.Header>
					<Modal.Title className="flex items-center gap-2">
						<Icon icon="lucide:download" />
						{t('import.title')}
					</Modal.Title>
				</Modal.Header>
				<Modal.Body className="flex flex-col gap-3">
					<p className="font-semibold text-sm text-text-accent">
						{t('import.description')}
					</p>
					{data && status === 'ready' && (
						<div className="flex flex-col gap-1.5">
							<span className="font-semibold text-sm">
								{t('import.records', {
									count: entriesCount,
								})}
							</span>
							<ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg bg-accent/50 p-2">
								{Object.entries(data)
									.sort(([a], [b]) => a.localeCompare(b))
									.map(([key, value]) => (
										<li
											className={`${montserrat.className} flex items-center justify-between gap-2 font-semibold text-xs`}
											key={key}
										>
											<span className="truncate">
												{key}
											</span>
											<span className="text-text-accent">
												{value.length}B
											</span>
										</li>
									))}
							</ul>
						</div>
					)}
				</Modal.Body>
				<Modal.Footer>
					<Button
						disabled={status === 'applying'}
						onClick={handleCancel}
						variant="secondary"
					>
						{t('import.cancel')}
					</Button>
					<Button
						className="gap-2"
						loading={status === 'applying'}
						onClick={handleConfirm}
						variant="primary"
					>
						<Icon className="text-lg" icon="lucide:check" />
						{t('import.confirm')}
					</Button>
				</Modal.Footer>
			</Modal.Content>
		</Modal.Root>
	)
}
