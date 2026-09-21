'use client'

import { Icon } from '@iconify/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { authService } from '@/services/auth/auth.service'
import {
	clearDesktopIntent,
	desktopLogin,
	issueDesktopLoginUrl,
	persistDesktopIntent,
} from '@/services/auth/desktop-auth'
import { userService } from '@/services/user/user.service'
import { montserrat, unbounded } from '../fonts'

export default function Page() {
	const [username, setUsername] = useState('')
	const [password, setPassword] = useState('')
	const [websiteLoading, setWebsiteLoading] = useState(false)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const router = useRouter()
	const t = useTranslations()

	useEffect(() => {
		const params = new URLSearchParams(window.location.search)
		const desktopState = params.get('desktop_state')
		const codeChallenge = params.get('code_challenge')
		if (!desktopState || !codeChallenge) return

		persistDesktopIntent({
			desktop_state: desktopState,
			code_challenge: codeChallenge,
		})
		params.delete('desktop_state')
		params.delete('code_challenge')
		const query = params.toString()
		window.history.replaceState(
			null,
			'',
			query ? `?${query}` : window.location.pathname
		)
	}, [])

	const handleWebsiteLogin = async () => {
		if (websiteLoading) return
		setWebsiteLoading(true)
		setError(null)
		try {
			const opened = await desktopLogin()
			if (!opened) setError(t('auth.websiteLoginUnavailable'))
		} catch {
			setError(t('auth.loginError'))
		} finally {
			setWebsiteLoading(false)
		}
	}

	const handlePasswordLogin = async (event: React.FormEvent) => {
		event.preventDefault()
		if (!username || !password || isSubmitting) return

		setIsSubmitting(true)
		setError(null)
		try {
			await authService.login(username, password)
			const desktopUrl = await issueDesktopLoginUrl().catch(() => null)
			if (desktopUrl) {
				clearDesktopIntent()
				window.location.replace(desktopUrl)
				return
			}
			const user = await userService.getMe()
			const isGuest = user.roles?.some(
				(role) => role.name === 'clan_guest'
			)
			router.replace(isGuest ? '/me/clan' : '/me')
		} catch (caughtError) {
			const message = (
				caughtError as { response?: { data?: { error?: string } } }
			)?.response?.data?.error
			setError(message ?? t('auth.loginError'))
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<section className="flex min-h-dvh w-full items-center justify-center px-4 py-8">
			<div className="flex w-full max-w-2xl flex-col gap-5">
				<header className="flex items-center gap-2">
					<Icon className="text-2xl" icon="lucide:log-in" />
					<h1
						className={`${unbounded.className} font-semibold text-xl`}
					>
						{t('auth.title')}
					</h1>
				</header>

				<div className="flex flex-col gap-6 rounded-xl bg-card p-6 ring-2 ring-primary/50">
					<Button
						className="w-full gap-2"
						loading={websiteLoading}
						onClick={handleWebsiteLogin}
						variant="primary"
					>
						<Icon className="text-xl" icon="lucide:external-link" />
						{t('auth.loginThroughWebsite')}
					</Button>

					<div className="flex items-center gap-3">
						<span className="h-px flex-1 bg-border" />
						<p className="font-semibold text-xs">{t('auth.or')}</p>
						<span className="h-px flex-1 bg-border" />
					</div>

					<form
						className="flex flex-col gap-3"
						onSubmit={handlePasswordLogin}
					>
						<h2 className="flex items-center gap-2 font-semibold text-lg">
							<Icon className="text-xl" icon="lucide:key-round" />
							{t('auth.loginByPassword')}
						</h2>
						<Input
							autoComplete="username"
							label="auth.username"
							onChange={(event) =>
								setUsername(event.target.value)
							}
							value={username}
						/>
						<Input
							autoComplete="current-password"
							label="auth.password"
							onChange={(event) =>
								setPassword(event.target.value)
							}
							type="password"
							value={password}
						/>
						{error && (
							<p className="font-semibold text-destructive text-sm">
								{error}
							</p>
						)}
						<Button
							className="w-full"
							disabled={!username || !password}
							loading={isSubmitting}
							type="submit"
							variant="secondary"
						>
							{t('auth.login')}
						</Button>
					</form>
				</div>

				<p
					className={`${montserrat.className} font-semibold text-sm text-text-accent`}
				>
					{t('auth.terms')}{' '}
					<Link
						className="underline underline-offset-2"
						href="/legal/tos"
					>
						{t('auth.termsLink')}
					</Link>
				</p>
			</div>
		</section>
	)
}
