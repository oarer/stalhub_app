'use client'

import { Icon } from '@iconify/react'
import { useQuery } from '@tanstack/react-query'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { montserrat, unbounded } from '@/app/fonts'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/cn'
import { artHref } from '@/lib/desktop-href'
import { isVideoUrl, resolveImageUrl } from '@/lib/imageUrl'
import { artQueries } from '@/queries/art/art.queries'
import { useNsfwGateStore } from '@/stores/useNsfwGate.store'
import { ArtType } from '@/types/art.type'

export default function ArtsView() {
	const t = useTranslations()
	const router = useRouter()
	const pathname = usePathname()
	const searchParams = useSearchParams()

	// Состояние списка живёт в URL: «назад» из рисунка возвращает
	// на ту же страницу/фильтры, позиция восстанавливается скроллом.
	const page = Math.max(1, Number(searchParams.get('page')) || 1)
	const typeParam = searchParams.get('type')
	const type: ArtType | '' =
		typeParam === ArtType.NSFW ? ArtType.NSFW : ''
	const [search, setSearch] = useState(searchParams.get('q') ?? '')
	const [nsfwGateOpen, setNsfwGateOpen] = useState(false)
	const pendingNsfwId = useRef<string | null>(null)
	const ageConfirmed = useNsfwGateStore((s) => s.ageConfirmed)
	const confirmAge = useNsfwGateStore((s) => s.confirmAge)
	const debouncedSearch = useDebounce(search, 300)
	const take = 24

	const updateParams = (
		patch: { page?: number; type?: string; q?: string },
		scrollToTop = false
	) => {
		const params = new URLSearchParams(searchParams.toString())
		if (patch.page !== undefined) {
			if (patch.page <= 1) params.delete('page')
			else params.set('page', String(patch.page))
		}
		if (patch.type !== undefined) {
			if (!patch.type) params.delete('type')
			else params.set('type', patch.type)
		}
		if (patch.q !== undefined) {
			if (!patch.q) params.delete('q')
			else params.set('q', patch.q)
		}
		const query = params.toString()
		router.replace(query ? `${pathname}?${query}` : pathname, {
			scroll: false,
		})
		if (scrollToTop) {
			// В аппке скроллит main, на сайте — документ.
			const main = document.querySelector('main.app-main')
			if (main) main.scrollTo({ top: 0 })
			else window.scrollTo({ top: 0 })
		}
	}

	const setPage = (next: number | ((p: number) => number)) => {
		const value = typeof next === 'function' ? next(page) : next
		updateParams({ page: value }, true)
	}

	const setType = (next: ArtType | '') => {
		updateParams({ type: next, page: 1 })
	}

	const tags = debouncedSearch
		? debouncedSearch
				.split(/[,\s]+/)
				.map((s) => s.trim())
				.filter(Boolean)
		: undefined

	const { data, isPending, isPlaceholderData } = useQuery(
		artQueries.publicList({ take, page, tags, type: type || undefined })
	)

	const arts = data?.data ?? []
	const totalPages = data ? Math.ceil(data.total_count / take) : 1

	// Поиск в URL (debounce), чтобы «назад» его тоже восстанавливал.
	const firstRender = useRef(true)
	// biome-ignore lint/correctness/useExhaustiveDependencies: sync on debounced value only
	useEffect(() => {
		if (firstRender.current) {
			firstRender.current = false
			return
		}
		const params = new URLSearchParams(searchParams.toString())
		if (debouncedSearch) params.set('q', debouncedSearch)
		else params.delete('q')
		params.delete('page')
		const query = params.toString()
		router.replace(query ? `${pathname}?${query}` : pathname, {
			scroll: false,
		})
	}, [debouncedSearch])

	// Позиция в списке для стрелок ←/→ на странице рисунка.
	const stashListPosition = (id: string) => {
		try {
			sessionStorage.setItem(
				'arts.lastList',
				JSON.stringify({
					ids: arts.map((art) => art.id),
					index: arts.findIndex((art) => art.id === id),
				})
			)
		} catch {
			/* ignore */
		}
	}

	return (
		<section className="mx-auto max-w-380 space-y-6 px-4 pt-32 pb-12 sm:px-6">
			<div className="flex items-center justify-between">
				<h1 className={`${unbounded.className} font-bold text-3xl`}>
					{t('arts.title')}
				</h1>
				<span className="font-semibold text-sm text-text-accent">
					{t('arts.total', { count: data?.total_count ?? 0 })}
				</span>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-3">
				<Input
					className="w-full max-w-lg"
					label="arts.search"
					onChange={(e) => {
						setSearch(e.target.value)
					}}
					value={search}
				/>

				<div className="flex gap-1">
					<Button
						className="font-semibold"
						onClick={() => {
							setType('')
						}}
						size="sm"
						variant={type === '' ? 'secondary' : 'ghost'}
					>
						{t('arts.all')}
					</Button>
					<Button
						className="font-semibold"
						onClick={() => {
							setType(type === ArtType.NSFW ? '' : ArtType.NSFW)
						}}
						size="sm"
						variant={type === ArtType.NSFW ? 'secondary' : 'ghost'}
					>
						NSFW
					</Button>
				</div>
			</div>

			{isPending ? (
				<div className="columns-2 gap-3 sm:columns-4">
					{Array.from({ length: take }).map((_, i) => (
						<div
							className="mb-3 aspect-square animate-pulse rounded-lg bg-card"
							key={i}
						/>
					))}
				</div>
			) : arts.length === 0 ? (
				<div className="flex flex-col items-center gap-3 py-16">
					<Icon
						className="size-10 text-text-accent"
						icon="lucide:image"
					/>
					<p className="font-semibold text-sm text-text-accent">
						{t('arts.empty')}
					</p>
				</div>
			) : (
				<div
					className={cn(
						'columns-2 gap-3 sm:columns-3 lg:columns-4',
						isPlaceholderData && 'opacity-60'
					)}
				>
					{arts.map((art) => (
						<Link
							className="group relative mb-3 block cursor-pointer break-inside-avoid overflow-hidden rounded-lg bg-card ring-2 ring-primary/30 duration-200 hover:ring-primary/70"
							href={artHref(art.id)}
							key={art.id}
							onClick={
								art.type === ArtType.NSFW && !ageConfirmed
									? (e) => {
											e.preventDefault()
											pendingNsfwId.current = art.id
											setNsfwGateOpen(true)
										}
									: () => {
											stashListPosition(art.id)
										}
							}
							onMouseEnter={
								art.type === ArtType.NSFW && !ageConfirmed
									? () => {
											pendingNsfwId.current = art.id
											setNsfwGateOpen(true)
										}
									: undefined
							}
						>
							{art.type === ArtType.NSFW && (
								<Badge
									className="absolute top-2 right-2 z-2"
									variant={'nsfw'}
								>
									NSFW
								</Badge>
							)}
							{art.image_url ? (
								isVideoUrl(art.image_url) ? (
									<>
										<video
											className={cn(
												'h-auto w-full transition-all duration-400',
												art.type === ArtType.NSFW &&
													cn(
														'blur-xl',
														ageConfirmed &&
															'hover:blur-none'
													)
											)}
											muted
											playsInline
											preload="metadata"
											src={
												resolveImageUrl(
													art.image_url
												) ?? ''
											}
										/>
										<Icon
											className="absolute top-1/2 left-1/2 z-2 size-10 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow-md"
											icon="lucide:play"
										/>
									</>
								) : (
									<Image
										alt={art.title || 'none'}
										className={cn(
											'h-auto w-full transition-all duration-400',
											art.type === ArtType.NSFW &&
												cn(
													'blur-xl',
													ageConfirmed &&
														'hover:blur-none'
												)
										)}
										height={1600}
										src={
											resolveImageUrl(art.image_url) ?? ''
										}
										unoptimized
										width={1200}
									/>
								)
							) : (
								<div className="flex aspect-square w-full items-center justify-center">
									<Icon
										className="size-10 text-text-accent"
										icon="lucide:image-off"
									/>
								</div>
							)}
							<div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-linear-to-t from-black/70 to-transparent px-3 pt-8 pb-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
								<span className="truncate font-semibold text-sm text-white">
									{art.title}
								</span>
								{art.stars_count > 0 && (
									<span className="flex shrink-0 items-center gap-1 text-sm text-white">
										<Icon icon="lucide:star" />
										{art.stars_count}
									</span>
								)}
							</div>
						</Link>
					))}
				</div>
			)}

			{totalPages > 1 && (
				<div className="flex items-center justify-center gap-2">
					<Button
						disabled={page <= 1}
						onClick={() => setPage((p) => p - 1)}
						size="sm"
						variant="outline"
					>
						<Icon icon="lucide:chevron-left" />
					</Button>
					<span
						className={`${montserrat.className} text-foreground text-sm`}
					>
						{page} / {totalPages}
					</span>
					<Button
						disabled={page >= totalPages}
						onClick={() => setPage((p) => p + 1)}
						size="sm"
						variant="outline"
					>
						<Icon icon="lucide:chevron-right" />
					</Button>
				</div>
			)}

			<Modal.Root
				onOpenChange={(open) => {
					if (!open) setNsfwGateOpen(false)
				}}
				open={nsfwGateOpen}
			>
				<Modal.Content fullScreen={false}>
					<Modal.Header>
						<Modal.Title className="flex items-center gap-2">
							<Icon icon="emojione-monotone:no-one-under-eighteen" />
							{t('arts.nsfwAge.title')}
						</Modal.Title>
					</Modal.Header>
					<Modal.Body className="flex flex-col gap-2">
						<p className="font-semibold">
							{t('arts.nsfwAge.description')}
						</p>
						<p className="font-semibold text-foreground text-xs">
							{t('arts.nsfwAge.terms')}{' '}
							<Link
								className="text-primary underline underline-offset-2"
								href="/legal/tos"
							>
								{t('arts.nsfwAge.details')}
							</Link>
						</p>
					</Modal.Body>
					<Modal.Footer>
						<Modal.Close className="gap-2">
							<Icon icon="lucide:undo-2" />
							Назад
						</Modal.Close>
						<Button
							className="gap-2"
							onClick={() => {
								confirmAge()
								setNsfwGateOpen(false)

								const id = pendingNsfwId.current
								pendingNsfwId.current = null

								if (id) {
									stashListPosition(id)
									router.push(artHref(id))
								}
							}}
						>
							{t('arts.nsfwAge.confirm')}
							<Icon icon="lucide:check" />
						</Button>
					</Modal.Footer>
				</Modal.Content>
			</Modal.Root>
		</section>
	)
}
