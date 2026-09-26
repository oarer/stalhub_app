import { NextResponse, type NextRequest } from 'next/server'

// Telegram credentials remain server-side on the website.
export async function POST(request: NextRequest) {
  const requestOrigin = request.headers.get('origin')
  const host = request.headers.get('host') || new URL(request.url).host
  if ((requestOrigin && requestOrigin !== `http://${host}`) || request.headers.get('sec-fetch-site') === 'cross-site') {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 })
  }
  try {
    const text = await request.text()
    if (text.length > 64000) return NextResponse.json({ error: 'Report too large' }, { status: 413 })
    const body = JSON.parse(text)
    if (typeof body?.content !== 'string' || !body.content) {
      return NextResponse.json({ message: 'Missing content' }, { status: 400 })
    }
    const response = await fetch('https://stalhub.dev/api/error-report', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: body.content }),
      signal: AbortSignal.timeout(15000), redirect: 'error',
    })
    return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json' } })
  } catch {
    return NextResponse.json({ error: 'Report service unavailable' }, { status: 503 })
  }
}
