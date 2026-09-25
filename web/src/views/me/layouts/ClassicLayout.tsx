'use client'

import type { MeLayoutProps } from '@/types/me.types'
import MeBanner from '@/views/me/components/MeBanner'
import MeSidebar from '@/views/me/components/MeSidebar'

export default function ClassicLayout({
	children,
	user,
	onCardChange,
}: MeLayoutProps) {
	const customization = user.customization

	return (
		<section className="grid grid-cols-1 gap-4 px-4 pt-22 lg:grid-cols-[20%_1fr] lg:gap-8">
			<MeSidebar onCardChange={onCardChange} showBanner user={user} />
			<div className="pointer-events-none fixed inset-0 z-0">
				<MeBanner
					bannerColor={customization.banner_color}
					bannerImage={customization.banner_image}
					bannerMode={customization.banner_mode}
					bannerType={customization.banner_type}
					className="mt-8 mb-8 lg:hidden"
				/>
			</div>
			<div className="z-1 pb-4 lg:px-0 lg:py-4">{children}</div>
		</section>
	)
}
