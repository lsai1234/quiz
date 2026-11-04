/**
 * The stack guide by email: the image at the top (their guide, drawn), then
 * the same content as text, so it reads with images off and to a screen reader:
 * their day, then each product with when, how much, the approved science and
 * the label's warnings. Then the link to the guide page and the calendar file.
 *
 * Words from `./copy`; everything put into the HTML is escaped here.
 */
import { emailShell, SHELL_STYLE } from '@/lib/notify/brand'
import type { BrandContext } from '@/lib/notify/templates'
import { escapeHtml } from '@/lib/notify/receipt-email'
import { appBaseUrl } from '@/lib/notify'
import type { RenderedEmail } from '@/lib/notify/types'
import { NOT_MEDICAL_ADVICE_SENTENCE } from '@/lib/legal/content'
import { spokenClock } from '@/lib/routine/ring'
import { longDate, type StackGuide } from './build'
import { GUIDE_COPY } from './copy'

export interface GuideLinks {
  page: string
  image: string
  calendar: string
}

const S = SHELL_STYLE
const h = (text: string) => escapeHtml(text)

function sectionTitle(text: string): string {
  return `<div style="font-family:${S.sans};font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:${S.accentInk};padding:22px 0 8px">${h(text)}</div>`
}

export function stackGuideEmail(guide: StackGuide, links: GuideLinks, brand: BrandContext): RenderedEmail {
  const c = GUIDE_COPY
  const first = guide.firstName

  const image = {
    html: `<div style="padding:4px 0 8px"><a href="${h(links.page)}" style="text-decoration:none"><img src="${h(links.image)}" width="536" alt="${h(c.imageAlt(guide.products.length))}" style="display:block;width:100%;max-width:536px;height:auto;border:0;border-radius:14px"></a></div>`,
    text: `${c.open}: ${links.page}`,
  }

  const dayRows = guide.routine.moments.map((m) => {
    const when = m.minutes === null ? m.label : `${spokenClock(m.minutes)} · ${m.label}`
    const what = m.items.map((i) => `${i.title}${i.days === 'every-day' ? '' : ` (${i.daysLabel})`}`).join(', ')
    return { when, what }
  })
  const day = {
    html: [
      sectionTitle(c.routineHeading),
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">`,
      ...dayRows.map(
        (r) =>
          `<tr><td style="padding:8px 0;border-top:1px solid ${S.hairline};font-family:${S.sans};font-size:14px;line-height:1.45;color:${S.text}"><strong>${h(r.when)}</strong><br><span style="color:${S.soft}">${h(r.what)}</span></td></tr>`,
      ),
      `</table>`,
    ].join(''),
    text: [c.routineHeading.toUpperCase(), ...dayRows.map((r) => `${r.when}: ${r.what}`)].join('\n'),
  }

  const products = {
    html: [
      sectionTitle(c.productsHeading),
      ...guide.products.map((p) => {
        const when = [p.time, p.moment, p.daysLabel, p.amount].filter(Boolean).join(' · ')
        const claims = p.claims.length
          ? p.claims
              .map(
                (cl) =>
                  `<div style="margin:8px 0 0;padding:8px 12px;background:${S.tint};border-left:3px solid #00d4ff;font-family:${S.sans};font-size:13px;line-height:1.5;color:${S.text}">“${h(cl.wording)}”<br><span style="font-size:12px;color:${S.soft}">${h(c.conditionOfUse(cl.condition))}</span></div>`,
              )
              .join('')
          : `<div style="margin:8px 0 0;font-family:${S.sans};font-size:12px;line-height:1.5;color:${S.soft}">${h(c.noClaim)}</div>`
        const warnings = p.warnings.length
          ? `<div style="margin:8px 0 0;font-family:${S.sans};font-size:12px;line-height:1.5;color:${S.soft}">${p.warnings.map(h).join('<br>')}</div>`
          : ''
        return `<div style="padding:14px 0;border-top:1px solid ${S.hairline}">
<div style="font-family:${S.sans};font-size:16px;font-weight:800;color:${S.text}">${h(p.short)} <span style="font-size:12px;font-weight:600;color:${S.soft}">${h(p.type)}</span></div>
<div style="font-family:${S.sans};font-size:13px;line-height:1.5;color:${S.text};padding-top:4px"><strong>${h(c.when)}:</strong> ${h(when)}</div>
${p.serving ? `<div style="font-family:${S.sans};font-size:13px;line-height:1.5;color:${S.soft}">${h(c.eachServing)}: ${h(p.serving)}</div>` : ''}
${claims}${warnings}</div>`
      }),
      `<div style="font-family:${S.sans};font-size:12px;line-height:1.5;color:${S.soft};padding-top:6px">${h(c.scienceNote)}</div>`,
    ].join(''),
    text: [
      c.productsHeading.toUpperCase(),
      ...guide.products.map((p) =>
        [
          `${p.short} (${p.type})`,
          `${c.when}: ${[p.time, p.moment, p.daysLabel, p.amount].filter(Boolean).join(' · ')}`,
          ...(p.serving ? [`${c.eachServing}: ${p.serving}`] : []),
          ...(p.claims.length ? p.claims.map((cl) => `“${cl.wording}” (${c.conditionOfUse(cl.condition)})`) : [c.noClaim]),
          ...p.warnings,
        ].join('\n'),
      ),
      c.scienceNote,
    ].join('\n\n'),
  }

  const services = guide.services.length
    ? {
        html: sectionTitle(c.servicesHeading) + guide.services.map((s) => `<div style="font-family:${S.sans};font-size:14px;line-height:1.5;color:${S.text};padding:3px 0">✓ ${h(s)}</div>`).join(''),
        text: [c.servicesHeading.toUpperCase(), ...guide.services.map((s) => `· ${s}`)].join('\n'),
      }
    : null

  const checkIn = {
    html: sectionTitle(c.checkInHeading) + `<div style="font-family:${S.sans};font-size:14px;line-height:1.6;color:${S.text}">${h(c.checkIn(longDate(guide.checkInOn)))}</div>`,
    text: [c.checkInHeading.toUpperCase(), c.checkIn(longDate(guide.checkInOn))].join('\n'),
  }

  const shell = emailShell({
    preheader: c.emailPreheader,
    heading: c.title(first),
    intro: c.emailIntro(first),
    paragraphs: [],
    blocks: [image, day, products, ...(services ? [services] : []), checkIn],
    cta: { label: c.open, url: links.page },
    secondaryCta: { label: c.reminders, url: links.calendar },
    footnote: NOT_MEDICAL_ADVICE_SENTENCE,
    links: { base: brand.baseUrl ?? appBaseUrl(), optOutUrl: null },
    marketing: null,
  })
  return { subject: c.emailSubject(first), ...shell }
}
