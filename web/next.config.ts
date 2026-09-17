import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
	assetPrefix: undefined,
	outputFileTracingRoot: process.cwd(),
	outputFileTracingIncludes: { '/legal/tos': ['./src/app/(public)/legal/tos/tos.mdx'] },
	output: 'standalone',
	allowedDevOrigins: ['192.168.1.40', 'localhost'],
	images: {
		// Electron's Linux runtime can conflict with sharp/libvips. Browser-side
		// image decoding preserves images without a native optimizer dependency.
		unoptimized: true,
		qualities: [25, 50, 75, 85, 95, 100],
		remotePatterns: [
			{
				protocol: 'https',
				hostname: 'cdn.discordapp.com',
				pathname: '/**',
			},
			{
				protocol: 'https',
				hostname: 'media.discordapp.net',
				pathname: '/**',
			},
			{
				protocol: 'https',
				hostname: 'github.com',
				pathname: '/**',
			},
			{
				protocol: 'http',
				hostname: 'localhost',
				pathname: '/**',
			},
			{
				protocol: 'https',
				hostname: 'raw.githubusercontent.com',
				pathname: '/**',
			},
			{
				protocol: 'https',
				hostname: 'avatars.githubusercontent.com',
				pathname: '/**',
			},
			{
				protocol: 'https',
				hostname: 'cdn.stalhub.dev',
				pathname: '/**',
			},
		],
	},
}

export default withNextIntl(nextConfig)
