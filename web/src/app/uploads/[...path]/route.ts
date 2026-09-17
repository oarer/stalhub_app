import { proxyUpload } from '@/lib/desktop-upload-proxy'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
 const { path } = await context.params
 return proxyUpload(request, path, process.env.STALHUB_API_ORIGIN || 'https://api.stalhub.dev')
}
