'use client'

import { Icon } from '@iconify/react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { montserrat } from '@/app/fonts'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Switch'
import { toast } from '@/components/ui/Toast'
import { fetchLatestCommit, fetchListing } from '@/lib/listing'
import { clearBrowserData } from '@/lib/localPersistence'
import { useItemStore } from '@/stores/items.store'
import { useBuildStore } from '@/stores/useBuild.store'
import { useSettingsStore } from '@/stores/useSettings.store'
import { Section } from '@/views/me/components/Section'
import { SettingRow } from '@/views/me/components/settings/SettingRow'

export default function DataSettings() {
	const t = useTranslations()

	const persistLocalData = useSettingsStore((state) => state.persistLocalData)
	const autoCheckUpdates = useSettingsStore((state) => state.autoCheckUpdates)
	const setPersistLocalData = useSettingsStore(
		(state) => state.setPersistLocalData
	)
	const setAutoCheckUpdates = useSettingsStore(
		(state) => state.setAutoCheckUpdates
	)

	const [lastUpdate, setLastUpdate] = useState<string | null>(null)
	const [checking, setChecking] = useState(false)

	const handlePersistChange = (checked: boolean) => {
		setPersistLocalData(checked)
		if (!checked) {
			useItemStore.persist.clearStorage()
			useBuildStore.persist.clearStorage()
		}
	}

	const checkUpdates = useCallback(async () => {
		setChecking(true)
		try {
			const latestSHA = await fetchLatestCommit()
			const current = useItemStore.getState().commit

			if (latestSHA && latestSHA !== current) {
				const items = await fetchListing(latestSHA)
				if (!items) throw new Error('catalog fetch failed')
				useItemStore.getState().setItems(items)
				useItemStore.getState().setCommit(latestSHA)
				useItemStore.getState().setCheckedAt(Date.now())
				setLastUpdate(new Date().toLocaleTimeString())
				toast.success(t('settings.data.updated'))
				return
			}

			setLastUpdate(new Date().toLocaleTimeString())
			toast.success(t('settings.data.up_to_date'))
		} catch {
			toast.error(t('settings.data.check_error'))
		} finally {
			setChecking(false)
		}
	}, [t])

	useEffect(() => {
		if (autoCheckUpdates) void checkUpdates()
	}, [autoCheckUpdates, checkUpdates])

	const reset = () => {
		if (!window.confirm(t('settings.data.reset_confirm'))) return
		clearBrowserData()
		useSettingsStore.getState().resetSettings()
		useSettingsStore.persist.clearStorage()
		useItemStore.persist.clearStorage()
		useItemStore.setState({
			items: null,
			commit: null,
			checkedAt: 0,
			loading: false,
			error: null,
		})
		useBuildStore.persist.clearStorage()
		const initial = useBuildStore.getInitialState()
		useBuildStore.setState({
			build: initial.build,
			defaults: initial.defaults,
			savedBuilds: [],
			currentBuildId: null,
		})
		window.location.reload()
	}

	return (
		<Section icon="lucide:database" title={t('settings.data.title')}>
			<div className="flex flex-col gap-2">
				<SettingRow
					description={t('settings.data.local_storage_desc')}
					title={t('settings.data.local_storage')}
				>
					<Switch
						checked={persistLocalData}
						onCheckedChange={handlePersistChange}
					/>
				</SettingRow>
				<SettingRow
					description={t('settings.data.auto_updates_desc')}
					title={t('settings.data.auto_updates')}
				>
					<Switch
						checked={autoCheckUpdates}
						onCheckedChange={setAutoCheckUpdates}
					/>
				</SettingRow>
				<div className="flex flex-wrap gap-2">
					<Button
						className="gap-2"
						loading={checking}
						onClick={() => void checkUpdates()}
						variant="secondary"
					>
						<Icon icon="lucide:refresh-cw" />{' '}
						{t('settings.data.check_updates')}
					</Button>
					<Button className="gap-2" onClick={reset} variant="danger">
						<Icon icon="lucide:trash-2" />{' '}
						{t('settings.data.reset')}
					</Button>
				</div>
				{lastUpdate && (
					<p
						className={`${montserrat.className} font-semibold text-muted-foreground text-sm`}
					>
						{t('settings.data.checked_at', { time: lastUpdate })}
					</p>
				)}
			</div>
		</Section>
	)
}
