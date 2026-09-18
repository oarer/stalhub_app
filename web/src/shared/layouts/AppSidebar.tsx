'use client'

import { Icon } from '@iconify/react'
import { useQuery } from '@tanstack/react-query'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import { montserrat, unbounded } from '@/app/fonts'
import { Button } from '@/components/ui/Button'
import { Divider } from '@/components/ui/Divider'
import { NAV_STRUCTURE, type NavItem } from '@/constants/nav.const'
import useSvg from '@/hooks/useSvg'
import { cn } from '@/lib/cn'
import { userQueries } from '@/queries/user/user.queries'
import ChangeLang from '@/shared/layouts/nav/components/ChangeLang'
import ChangeTheme from '@/shared/layouts/nav/components/ChangeTheme'
import { filterTabsByRoles, tabGroups } from '@/types/me.types'

type SidebarView = 'tools' | 'me'

function isHrefActive(pathname: string, href?: string) {
	if (!href) return false
	return (
		pathname === href || (href !== '/' && pathname.startsWith(`${href}/`))
	)
}

function linkClass(active: boolean) {
	return cn(
		'group flex min-h-11 items-center gap-3 rounded-xl px-3 transition-colors',
		active
			? 'bg-primary text-primary-foreground'
			: 'text-card-foreground hover:bg-muted/70 hover:text-muted-foreground'
	)
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
	const t = useTranslations()
	const href = item.href ?? item.submenu?.find((entry) => entry.href)?.href

	if (!href) return null

	return (
		<Link
			aria-current={active ? 'page' : undefined}
			className={linkClass(active)}
			href={href}
			title={t(item.labelKey)}
		>
			<Icon className="size-5 shrink-0" icon={item.icon} />
			<span className="hidden truncate font-semibold text-sm sm:block">
				{t(item.labelKey)}
			</span>
		</Link>
	)
}

export default function AppSidebar() {
	const pathname = usePathname()
	const { data: user } = useQuery(userQueries.getMe())
	const { data: unreadCount } = useQuery({
		...userQueries.getUnreadCount(),
		enabled: !!user,
	})
	const t = useTranslations()
	const svgPath = useSvg()

	const isMeRoute = pathname === '/me' || pathname.startsWith('/me/')
	const [view, setView] = useState<SidebarView>(isMeRoute ? 'me' : 'tools')

	useEffect(() => {
		setView(isMeRoute ? 'me' : 'tools')
	}, [isMeRoute])

	const meGroups = useMemo(
		() =>
			filterTabsByRoles(tabGroups, user?.roles ?? [])
				.map((group) => ({
					...group,
					items: group.items.filter(
						(tab) => tab.href !== '/me/notifications'
					),
				}))
				.filter((group) => group.items.length > 0),
		[user?.roles]
	)

	const isNotificationsRoute = isHrefActive(pathname, '/me/notifications')

	const toolsActive = useMemo(() => {
		let active: string | null = null
		let bestLength = -1

		for (const group of NAV_STRUCTURE) {
			for (const item of group.items) {
				const hrefs = [
					item.href,
					...(item.submenu?.map((entry) => entry.href) ?? []),
				].filter(Boolean) as string[]

				for (const href of hrefs) {
					if (
						isHrefActive(pathname, href) &&
						href.length > bestLength
					) {
						bestLength = href.length
						active = `${group.key}:${item.key}`
					}
				}
			}
		}

		return active
	}, [pathname])

	const meActive = useMemo(() => {
		let active: string | null = null
		let bestLength = -1

		for (const group of meGroups) {
			for (const tab of group.items) {
				const matches =
					tab.href === '/me'
						? pathname === '/me'
						: isHrefActive(pathname, tab.href)

				if (matches && tab.href.length > bestLength) {
					bestLength = tab.href.length
					active = tab.href
				}
			}
		}

		return active
	}, [meGroups, pathname])

	return (
		<aside className="fixed inset-y-0 left-0 z-80 flex w-16 flex-col gap-2 border-primary/20 border-r bg-card/90 px-2 py-3 shadow-xl backdrop-blur-xl sm:w-72 sm:px-4">
			<Link
				className="flex h-12 items-center gap-3 rounded-xl px-2 transition-opacity hover:opacity-80"
				href="/"
			>
				<Image
					alt="Stalhub"
					height={32}
					src={`${svgPath}logo.svg`}
					width={32}
				/>
				<span
					className={`${unbounded.className} hidden font-bold text-md tracking-widest sm:block`}
				>
					STALHUB
				</span>
			</Link>

			{user ? (
				<Link
					className={cn(
						'flex items-center gap-3 rounded-xl bg-accent/50 p-2 transition-colors hover:bg-muted',
						isMeRoute ? 'ring-primary' : 'ring-primary/20'
					)}
					href="/me"
					title={user.name || user.username}
				>
					<Image
						alt={user.name || user.username}
						className="size-10 shrink-0 rounded-lg border border-primary/50 object-cover"
						height={40}
						src={`${process.env.NEXT_PUBLIC_API}/api/v1/users/avatar/${user.id}`}
						unoptimized
						width={40}
					/>
					<div className="hidden min-w-0 sm:block">
						<p className="truncate font-semibold">
							{user.name || user.username}
						</p>
						<p
							className={`${montserrat.className} truncate font-semibold text-muted-foreground text-xs`}
						>
							@{user.username}
						</p>
					</div>
				</Link>
			) : (
				<Link
					className="mb-3 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-3 font-semibold text-primary-foreground transition-opacity hover:opacity-85 sm:justify-start"
					href="/auth"
					title={t('auth.title')}
				>
					<Icon className="size-5 shrink-0" icon="lucide:log-in" />
					<span className="hidden sm:block">{t('auth.login')}</span>
				</Link>
			)}

			{user && (
				<Link
					aria-current={isNotificationsRoute ? 'page' : undefined}
					className={cn(
						'flex min-h-11 items-center justify-center gap-3 rounded-xl px-3 transition-colors sm:justify-start',
						isNotificationsRoute
							? 'bg-primary text-primary-foreground'
							: 'text-card-foreground hover:bg-muted/70 hover:text-muted-foreground'
					)}
					href="/me/notifications"
					title={t('me.nav.notifications')}
				>
					<span className="relative shrink-0">
						<Icon className="size-5" icon="lucide:bell" />
						{unreadCount != null && unreadCount > 0 && (
							<span
								className={cn(
									'absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-bold text-[10px] leading-none',
									isNotificationsRoute
										? 'bg-primary-foreground text-primary'
										: 'bg-primary text-primary-foreground'
								)}
							>
								{unreadCount > 99 ? '99+' : unreadCount}
							</span>
						)}
					</span>
					<span className="hidden truncate font-semibold text-sm sm:block">
						{t('me.nav.notifications')}
					</span>
				</Link>
			)}

			<div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/40 p-1">
				<Button
					aria-pressed={view === 'tools'}
					onClick={() => setView('tools')}
					title={t('landing.tools.title')}
					variant={view === 'tools' ? 'primary' : 'ghost'}
				>
					<Icon
						className="size-5 shrink-0"
						icon="lucide:layout-grid"
					/>
				</Button>
				<Button
					aria-pressed={view === 'me'}
					onClick={() => setView('me')}
					title={t('dashboard.categories.account')}
					variant={view === 'me' ? 'primary' : 'ghost'}
				>
					<Icon
						className="size-5 shrink-0"
						icon="lucide:user-round"
					/>
				</Button>
			</div>

			<nav className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-0 sm:pr-1">
				{view === 'tools'
					? NAV_STRUCTURE.map((group) => (
							<section key={group.key}>
								<p
									className={`${unbounded.className} hidden font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.2em] sm:block`}
								>
									{t(group.titleKey)}
								</p>
								<div className="space-y-1">
									{group.items.map((item) => (
										<SidebarLink
											active={
												toolsActive ===
												`${group.key}:${item.key}`
											}
											item={item}
											key={item.key}
										/>
									))}
								</div>
							</section>
						))
					: meGroups.map((group, index) => (
							<section
								className="flex flex-col gap-2"
								key={group.label ?? index}
							>
								{group.label && (
									<p
										className={`${unbounded.className} hidden font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.2em] sm:block`}
									>
										{t(group.label)}
									</p>
								)}
								<div className="space-y-1">
									{group.items.map((tab) => {
										const active = meActive === tab.href

										return (
											<Link
												aria-current={
													active ? 'page' : undefined
												}
												className={linkClass(active)}
												href={tab.href}
												key={tab.href}
												title={t(tab.title)}
											>
												<Icon
													className="size-5 shrink-0"
													icon={tab.icon}
												/>
												<span className="hidden truncate font-semibold text-sm sm:block">
													{t(tab.title)}
												</span>
											</Link>
										)
									})}
								</div>
							</section>
						))}
			</nav>
			<Divider className="bg-accent/80" />
			<div className="flex items-center justify-center gap-1 py-2 sm:justify-start">
				<ChangeLang />
				<ChangeTheme />
			</div>
		</aside>
	)
}
