import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'

/**
 * GET /api/portal/test-views/emails            → [{ template, label, subject }]
 * GET /api/portal/test-views/emails?template=X → that email's HTML
 *
 * Every email drawn with sample data (`lib/samples/emails`). Founders only;
 * nothing is queued or sent.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { sampleEmails } = await import('@/lib/samples/emails')
  const emails = await sampleEmails()
  const template = new URL(req.url).searchParams.get('template')
  if (template) {
    const email = emails.find((e) => e.template === template)
    if (!email) return NextResponse.json({ error: 'Unknown email' }, { status: 404 })
    return new NextResponse(email.html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
  }
  return NextResponse.json(emails.map((e) => ({ template: e.template, label: e.label, subject: e.subject, text: e.text })))
}
