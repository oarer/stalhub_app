'use client'

import { Icon } from '@iconify/react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Switch'
import { toast } from '@/components/ui/Toast'
import type {
	DesktopUpdateState,
	DesktopUpdatesApi,
	UpdateChannel,
} from '@/types/electron'
import { Section } from '@/views/me/components/Section'
import { SettingRow } from '@/views/me/components/settings/SettingRow'

const busyStatuses = new Set(['checking', 'downloading'])

export default function UpdatesSection() {
	const t = useTranslations('settings.update')

	const [api, setApi] = useState<DesktopUpdatesApi | null>(null)
	const [state, setState] = useState<DesktopUpdateState | null>(null)

	useEffect(() => {
		const bridge = window.stalhubDesktop?.updates
		if (!bridge) return
		setApi(bridge)
		let mounted = true
		void bridge
			.info()
			.then((next) => {
				if (mounted) setState(next)
			})
			.catch(() => {
				if (mounted) setState(null)
			})
		const unsubscribe = bridge.onStatus((next) => {
			if (mounted) setState(next)
		})
		return () => {
			mounted = false
			unsubscribe()
		}
	}, [])

	if (!api) return null

	const handleAutoUpdate = (checked: boolean) => {
		void api
			.setAutoUpdate(checked)
			.then(setState)
			.catch(() => toast.error(t('toggle_error')))
	}

	const handleCheck = () => {
		void api
			.check()
			.then(setState)
			.catch(() => toast.error(t('check_error')))
	}

	const handleChannel = (channel: UpdateChannel) => {
		void api
			.setChannel(channel)
			.then(setState)
			.catch(() => toast.error(t('toggle_error')))
	}

	const handleRestart = () => api.restart()

	const busy = state ? busyStatuses.has(state.status) : false
	const supported = state?.supported ?? true

	let statusText = ''
	if (state) {
		switch (state.status) {
			case 'available':
				statusText = t('status_available', {
					version: state.newVersion ?? '',
				})
				break
			case 'checking':
				statusText = t('status_checking')
				break
			case 'downloading':
				statusText = t('status_downloading', {
					percent: Math.round(state.percent ?? 0),
				})
				break
			case 'downloaded':
				statusText = t('status_downloaded', {
					version: state.newVersion ?? '',
				})
				break
			case 'not-available':
				statusText = t('status_up_to_date')
				break
			case 'error':
				statusText = t('status_error')
				break
			case 'unsupported':
				statusText = t('status_unsupported')
				break
			case 'idle':
		}
	}

	return (
		<Section icon="lucide:download" title={t('title')}>
			<div className="flex flex-col gap-2">
				<SettingRow
					description={t('version_desc')}
					title={t('version')}
				>
					<Badge variant="primary">
						{state?.currentVersion ?? '…'}
					</Badge>
				</SettingRow>
				<SettingRow
					description={t('auto_update_desc')}
					title={t('auto_update')}
				>
					<Switch
						checked={state?.autoUpdate ?? true}
						disabled={!supported}
						onCheckedChange={handleAutoUpdate}
					/>
				</SettingRow>
				{state?.channel !== null && (
					<SettingRow
						description={t('channel_desc')}
						title={t('channel_label')}
					>
						<div className="flex shrink-0 gap-2">
							<Button
								onClick={() => handleChannel('stable')}
								variant={
									state?.channel === 'stable'
										? 'primary'
										: 'ghost'
								}
							>
								{t('channel_stable')}
							</Button>
							<Button
								onClick={() => handleChannel('prerelease')}
								variant={
									state?.channel === 'prerelease'
										? 'primary'
										: 'ghost'
								}
							>
								{t('channel_prerelease')}
							</Button>
						</div>
					</SettingRow>
				)}
				<div className="flex flex-wrap items-center gap-2">
					<Button
						className="gap-2"
						disabled={!supported || busy}
						loading={busy}
						onClick={handleCheck}
						variant="secondary"
					>
						<Icon icon="lucide:refresh-cw" /> {t('check')}
					</Button>
					{state?.status === 'downloaded' && state.newVersion && (
						<Button
							className="gap-2"
							onClick={handleRestart}
							variant="primary"
						>
							<Icon icon="lucide:rotate-cw" /> {t('restart')}
						</Button>
					)}
				</div>
				{state?.status === 'downloading' && (
					<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
						<div
							className="h-full rounded-full bg-primary transition-all duration-300"
							style={{
								width: `${Math.round(state.percent ?? 0)}%`,
							}}
						/>
					</div>
				)}
				{statusText && (
					<p
						className={`font-semibold text-sm ${
							state?.status === 'error'
								? 'text-destructive'
								: 'text-muted-foreground'
						}`}
					>
						{statusText}
						{state?.status === 'error' && state.error
							? `: ${state.error}`
							: ''}
					</p>
				)}
			</div>
		</Section>
	)
}
