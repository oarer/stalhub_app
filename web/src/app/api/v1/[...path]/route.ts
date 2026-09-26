import { proxyApi } from '@/lib/desktop-api-proxy'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
async function handler(request: Request, context: { params: Promise<{ path: string[] }> }) {
	const { path } = await context.params
	return proxyApi(request, path, process.env.STALHUB_API_ORIGIN || process.env.NEXT_PUBLIC_API || 'https://api.stalhub.dev')
}
export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as HEAD, handler as OPTIONS }
