'use client'

import type { MeLayoutProps } from '@/types/me.types'
import MeBanner from '@/views/me/components/MeBanner'

export default function CompactLayout({ children, user }: MeLayoutProps) {
	const customization = user.customization

	return (
		<div className="min-h-dvh">
			{customization.banner_type == 'BACKGROUND' && (
				<MeBanner
					bannerColor={customization.banner_color}
					bannerImage={customization.banner_image}
					bannerMode={customization.banner_mode}
					bannerType={customization.banner_type}
				/>
			)}

			<div className="relative z-1 px-2 pb-12 md:px-4">
				{customization.banner_type == 'HEADER' && (
					<MeBanner
						bannerColor={customization.banner_color}
						bannerImage={customization.banner_image}
						bannerMode={customization.banner_mode}
						bannerType={customization.banner_type}
						className='mt-6'
					/>
				)}
				<div className="py-6">{children}</div>
			</div>
		</div>
	)
}
