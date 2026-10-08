'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { Combobox } from '@/components/ui/Combobox'
import { toast } from '@/components/ui/Toast'
import type { CloseBehavior, DesktopWindowCtlApi } from '@/types/desktop'
import { Section } from '@/views/me/components/Section'
import { SettingRow } from '@/views/me/components/settings/SettingRow'

const BEHAVIORS: CloseBehavior[] = ['ask', 'close', 'tray']

/// Поведение при закрытии главного окна: спрашивать, выходить или
/// сворачивать в трей. Запомненный в модалке выбор меняется здесь.
export default function WindowSection() {
	const t = useTranslations('settings.window')

	const [api, setApi] = useState<DesktopWindowCtlApi | null>(null)
	const [behavior, setBehavior] = useState<CloseBehavior>('ask')

	useEffect(() => {
		const ctl = window.stalhubDesktop?.windowCtl
		if (!ctl) return
		setApi(ctl)
		let mounted = true
		void ctl
			.getCloseBehavior()
			.then((next) => {
				if (mounted) setBehavior(next)
			})
			.catch(() => {
				/* останется дефолт ask */
			})
		return () => {
			mounted = false
		}
	}, [])

	if (!api) return null

	return (
		<Section icon="lucide:app-window" title={t('title')}>
			<div className="flex flex-col gap-2">
				<SettingRow description={t('behavior_desc')} title={t('behavior')}>
					<Combobox
						onValueChange={(value) => {
							const next = value as CloseBehavior
							setBehavior(next)
							void api
								.setCloseBehavior(next)
								.catch(() => toast.error(t('save_error')))
						}}
						options={BEHAVIORS.map((value) => ({
							value,
							label: t(value),
						}))}
						translateOptions={false}
						value={behavior}
					/>
				</SettingRow>
			</div>
		</Section>
	)
}
