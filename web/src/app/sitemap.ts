import type { MetadataRoute } from 'next'
import meta from '@/constants/meta.json'

// Требуется для static export (десктоп); на сайте даёт ISR-кэш на час.
export const revalidate = 3600

export default function sitemap(): MetadataRoute.Sitemap {
	const baseUrl = 'https://stalhub.dev'

	const pages = Object.keys(meta).filter(
		(key) => key !== 'base' && key !== 'notFound'
	)

	return pages.map((route) => ({
		url: `${baseUrl}${route}`,
		lastModified: new Date(),
		changeFrequency: 'weekly',
		priority: route === '/' ? 1 : 0.7,
	}))
}
