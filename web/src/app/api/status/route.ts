import { NextResponse } from 'next/server'

// Monitoring credentials stay on the website, never in the desktop distribution.
export async function GET() {
  try {
    const response = await fetch('https://stalhub.dev/api/status', {
      signal: AbortSignal.timeout(15000), cache: 'no-store', redirect: 'error',
    })
    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' },
    })
  } catch {
    return NextResponse.json({ error: 'Status service unavailable' }, { status: 503 })
  }
}
