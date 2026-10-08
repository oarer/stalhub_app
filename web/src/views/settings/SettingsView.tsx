'use client'

import { useTranslations } from 'next-intl'
import ChangeLang from '@/shared/layouts/nav/components/ChangeLang'
import ChangeTheme from '@/shared/layouts/nav/components/ChangeTheme'
import { Section } from '@/views/me/components/Section'
import { SettingRow } from '@/views/me/components/settings/SettingRow'
import DataSettings from '@/views/settings/DataSettings'
import CrosshairSection from '@/views/settings/CrosshairSection'
import UpdatesSection from '@/views/settings/UpdatesSection'
import WindowSection from '@/views/settings/WindowSection'

export default function SettingsView() {
	const t = useTranslations()

	return (
		<div className="flex flex-col gap-6 px-4 py-4">
			<Section
				icon="lucide:palette"
				title={t('settings.appearance.title')}
			>
				<div className="flex flex-col gap-2">
					<SettingRow
						description={t('settings.appearance.language_desc')}
						title={t('settings.appearance.language')}
					>
						<ChangeLang />
					</SettingRow>
					<SettingRow
						description={t('settings.appearance.theme_desc')}
						title={t('settings.appearance.theme')}
					>
						<ChangeTheme />
					</SettingRow>
				</div>
			</Section>
			<UpdatesSection />
			<CrosshairSection />
			<WindowSection />
			<DataSettings />
		</div>
	)
}
