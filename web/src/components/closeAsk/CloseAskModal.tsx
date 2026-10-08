'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { CheckBox } from '@/components/ui/CheckBox'
import { Modal } from '@/components/ui/Modal'
import { toast } from '@/components/ui/Toast'
import type { CloseAction } from '@/types/desktop'

/// Модалка выбора при закрытии главного окна: выйти или свернуть в трей.
/// Открывается по событию stalhub:ask-close из Rust (см. tray.rs).
/// Монтируется в DesktopChromeGate — видна только в десктопе.
export default function CloseAskModal() {
	const t = useTranslations('closeAsk')
	const [open, setOpen] = useState(false)
	const [remember, setRemember] = useState(false)
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		const ctl = window.stalhubDesktop?.windowCtl
		if (!ctl) return
		return ctl.onAskClose(() => {
			setRemember(false)
			setBusy(false)
			setOpen(true)
		})
	}, [])

	const answer = useCallback(
		(action: CloseAction) => {
			const ctl = window.stalhubDesktop?.windowCtl
			if (!ctl || busy) return
			setBusy(true)
			void ctl
				.answerClose(action, remember)
				.then(() => {
					// close завершает процесс, tray прячет окно:
					// в обоих случаях модалка больше не нужна.
					setOpen(false)
				})
				.catch(() => toast.error(t('error')))
				.finally(() => setBusy(false))
		},
		[busy, remember, t]
	)

	return (
		<Modal.Root onOpenChange={setOpen} open={open}>
			<Modal.Content className="max-w-md">
				<Modal.Header>
					<Modal.Title>{t('title')}</Modal.Title>
				</Modal.Header>
				<div className="flex flex-col gap-4 px-1 py-2">
					<p className="text-muted-foreground text-sm">
						{t('description')}
					</p>
					<CheckBox
						checked={remember}
						label={t('remember')}
						onCheckedChange={setRemember}
					/>
				</div>
				<Modal.Footer>
					<Button
						disabled={busy}
						onClick={() => answer('tray')}
						variant="outline"
					>
						{t('tray')}
					</Button>
					<Button
						disabled={busy}
						onClick={() => answer('close')}
						variant="danger"
					>
						{t('close')}
					</Button>
				</Modal.Footer>
			</Modal.Content>
		</Modal.Root>
	)
}
