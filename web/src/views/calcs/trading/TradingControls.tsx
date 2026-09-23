'use client'

import { Icon } from '@iconify/react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CheckBox } from '@/components/ui/CheckBox'
import { Combobox } from '@/components/ui/Combobox'
import { isTauri } from '@/lib/tauri-bridge'
import type { Locale } from '@/types/item.type'
import type { Regions, Selection } from './trading'
import type { TradingCapture } from './useTradingCapture'

const LANGUAGES = {
	ru: 'rus+eng',
	en: 'eng',
	fr: 'fra+eng',
	es: 'spa+eng',
	ko: 'kor+eng',
}

const LANGUAGE_OPTIONS: { value: Locale; label: string }[] = [
	{ value: 'ru', label: 'Русский + English' },
	{ value: 'en', label: 'English' },
	{ value: 'fr', label: 'Français + English' },
	{ value: 'es', label: 'Español + English' },
	{ value: 'ko', label: '한국어 + English' },
]

function isTiny(value: Selection | null): boolean {
	return !!value && (value.width < 0.005 || value.height < 0.005)
}

export function TradingControls({
	capture,
	regions,
	language,
	onLanguageChange,
	upscale,
	onUpscaleChange,
	debug,
	onDebugChange,
	onResetRegions,
}: {
	capture: TradingCapture
	regions: Regions
	language: Locale
	onLanguageChange: (language: Locale) => void
	upscale: boolean
	onUpscaleChange: (upscale: boolean) => void
	debug: boolean
	onDebugChange: (debug: boolean) => void
	onResetRegions: () => void
}) {
	const t = useTranslations('trading')
	const running = capture.status !== 'idle'
	const tauriMode = isTauri()
	const sourceOptions = [
		{ value: '', label: t('primaryMonitor') },
		...capture.sources.map((source) => ({
			value: source.id,
			label: source.title
				? `${source.title} — ${source.app}`
				: source.app,
		})),
	]

	return (
		<Card.Root>
			<Card.Content className="flex flex-col gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<Button
						className="gap-2"
						disabled={capture.selecting || running}
						onClick={() => {
							onResetRegions()
							void capture.selectSource()
						}}
						variant="primary"
					>
						<Icon className="text-lg" icon="lucide:monitor-up" />
						{t('source')}
					</Button>
					<Button
						className="gap-2"
						disabled={
							!capture.connected ||
							!regions.items ||
							Object.values(regions).some(isTiny) ||
							running
						}
						onClick={() => {
							if (regions.items)
								void capture.start(
									regions.items,
									LANGUAGES[language],
									upscale,
									{
										player: regions.player,
										status: regions.status,
									}
								)
							if (
								typeof Notification !== 'undefined' &&
								Notification.permission === 'default'
							) {
								void Notification.requestPermission().catch(
									() => {
										/* Denied or unavailable (e.g. Wayland). */
									}
								)
							}
						}}
						variant="bordered"
					>
						<Icon className="text-lg" icon="lucide:play" />
						{t('start')}
					</Button>
					<Button
						className="gap-2"
						disabled={!running}
						onClick={capture.stop}
						variant="secondary"
					>
						<Icon className="text-lg" icon="lucide:square" />
						{t('stop')}
					</Button>
					<Button
						className="gap-2"
						disabled={!capture.connected && !capture.selecting}
						onClick={capture.disconnect}
						variant="ghost"
					>
						<Icon className="text-lg" icon="lucide:unplug" />
						{t('disconnect')}
					</Button>
					<div className="ml-auto flex w-44 flex-col gap-1">
						<span className="text-muted-foreground text-xs">
							{t('language')}
						</span>
						<Combobox
							className="w-full"
							disabled={running}
							onValueChange={(value) => {
								if (value in LANGUAGES)
									onLanguageChange(value as Locale)
							}}
							options={LANGUAGE_OPTIONS}
							translateOptions={false}
							value={language}
						/>
					</div>
				</div>
				{tauriMode && capture.connected && (
					<div className="flex w-full flex-col gap-1">
						<span className="text-muted-foreground text-xs">
							{t('sourceWindow')}
						</span>
						<Combobox
							className="w-full"
							disabled={running || capture.selecting}
							onValueChange={(value) => {
								capture.selectWindow(value === '' ? null : value)
							}}
							options={sourceOptions}
							translateOptions={false}
							value={capture.sourceId ?? ''}
						/>
					</div>
				)}

				<CheckBox
					checked={upscale}
					disabled={running}
					label={t('upscale')}
					onCheckedChange={onUpscaleChange}
				/>

				<CheckBox
					checked={debug}
					label={t('debug')}
					onCheckedChange={onDebugChange}
				/>

				<p
					className="font-semibold text-muted-foreground text-sm"
					data-testid="trading-performance"
				>
					{t('performance', {
						ms: capture.duration ?? '—',
						skipped: capture.skipped,
					})}
				</p>

				<p aria-live="polite" className="text-sm" role="status">
					{t(
						running
							? capture.status
							: capture.connected
								? 'ready'
								: 'idle'
					)}
					{running
						? ` · ${capture.progress}% · #${capture.frame}`
						: ''}
				</p>

				{capture.error && (
					<p className="font-semibold text-destructive" role="alert">
						{t(capture.error)}
					</p>
				)}

				<p className="text-muted-foreground text-sm">{t('privacy')}</p>
			</Card.Content>
		</Card.Root>
	)
}
