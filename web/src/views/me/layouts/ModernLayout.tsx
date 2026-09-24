'use client'

import type { MeLayoutProps } from '@/types/me.types'
import CompactHeader from '@/views/me/components/CompactHeader'

export default function ModernLayout({ children, user }: MeLayoutProps) {
	const customization = user.customization

	return (
		<div className="mx-auto max-w-285 px-2 pt-28 pb-0 md:px-4 lg:px-0 lg:pb-12 xl:pt-36">
			<div className="flex flex-col gap-4">
				<div className="hidden flex-col gap-4 lg:flex">
					<CompactHeader
						bannerColor={customization.banner_color}
						bannerImage={customization.banner_image}
						bannerMode={customization.banner_mode}
						bannerType={customization.banner_type}
						user={user}
					/>
				</div>
				<div className="z-1 py-6 lg:px-0 lg:py-0">{children}</div>
			</div>
		</div>
	)
}
