'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { Switch } from '@/components/ui/Switch'
import { toast } from '@/components/ui/Toast'
import type { DesktopAutostartApi } from '@/types/desktop'
import { Section } from '@/views/me/components/Section'
import { SettingRow } from '@/views/me/components/settings/SettingRow'

export default function StartupSection() {
	const t = useTranslations('settings.startup')
	const [api, setApi] = useState<DesktopAutostartApi | null>(null)
	const [enabled, setEnabled] = useState(false)

	useEffect(() => {
		let mounted = true
		let attached = false
		const attach = () => {
			const next = window.stalhubDesktop?.autostart
			if (!next || attached) return
			attached = true
			setApi(next)
			void next.info().then((value) => {
				if (mounted) setEnabled(value)
			})
		}
		window.addEventListener('stalhub:bridge-ready', attach)
		attach()
		return () => {
			mounted = false
			window.removeEventListener('stalhub:bridge-ready', attach)
		}
	}, [])

	if (!api) return null

	return (
		<Section icon="lucide:power" title={t('title')}>
			<SettingRow description={t('description')} title={t('enabled')}>
				<Switch
					checked={enabled}
					onCheckedChange={(value) => {
						setEnabled(value)
						void api.setEnabled(value).catch(() => {
							setEnabled(!value)
							toast.error(t('error'))
						})
					}}
				/>
			</SettingRow>
		</Section>
	)
}
