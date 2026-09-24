import type { MetadataRoute } from 'next'

// Требуется для static export (десктоп); на сайте даёт ISR-кэш на час.
export const revalidate = 3600

export default function robots(): MetadataRoute.Robots {
	return {
		rules: {
			userAgent: '*',
			allow: '/',
		},
		host: 'https://stalhub.dev',
		sitemap: 'https://stalhub.dev/sitemap.xml',
	}
}
