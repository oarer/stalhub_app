"use client";

import type { MeLayoutProps } from "@/types/me.types";
import MeBanner from "@/views/me/components/MeBanner";
import MeSidebar from "@/views/me/components/MeSidebar";

export default function ClassicLayout({
	children,
	user,
	onCardChange,
}: MeLayoutProps) {
	const customization = user.customization;

	return (
		<section className="mx-auto grid grid-cols-1 gap-8 px-2 pb-0 md:px-4 lg:grid-cols-[27%_70%] lg:px-0 lg:pb-12 xl:pt-36">
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
			<div className="pb-4 lg:px-0 lg:py-4 z-1">{children}</div>
		</section>
	);
}
