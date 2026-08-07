/**
 * Partners repository — the `partners`, `partner_codes` and `partner_terms`
 * tables (migration v9).
 *
 * Mirrors the dialect-neutral `?`-placeholder style of the other repositories so
 * it runs on SQLite and Postgres unchanged. Numbers are stored as TEXT, like
 * every other money/rate column in this schema, and parsed on read — the DDL is
 * written in the dialect intersection deliberately.
 *
 * Server-only.
 */
import { getEngine, now } from '@/lib/db/engine'
import type {
  CodeStatus,
  CodeTerms,
  Partner,
  PartnerCode,
  PartnerData,
  PartnerStatus,
  PartnerTerms,
  PayoutTerms,
} from './types'

const num = (v: string | number): number => (typeof v === 'number' ? v : Number.parseFloat(v))

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

// ─── Partners ─────────────────────────────────────────────────────────────────

interface PartnerRow {
  id: string
  email: string
  name: string
  password_hash: string | null
  status: string
  data: string
  created_at: string
  updated_at: string
}

function toPartner(row: PartnerRow): Partner {
  let data: PartnerData = {}
  try {
    data = JSON.parse(row.data) as PartnerData
  } catch {
    /* a malformed blob must not hide the partner */
  }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status as PartnerStatus,
    data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function createPartner(input: {
  email: string
  name: string
  data?: PartnerData
}): Promise<Partner> {
  const db = await getEngine()
  const at = now()
  const partner: Partner = {
    id: newId('ptnr'),
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    // No password yet — they set one from an invite. `invited` is what tells
    // the hub they have never signed in.
    status: 'invited',
    data: input.data ?? {},
    createdAt: at,
    updatedAt: at,
  }
  await db.run(
    `INSERT INTO partners (id, email, name, password_hash, status, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [partner.id, partner.email, partner.name, null, partner.status, JSON.stringify(partner.data), at, at],
  )
  return partner
}

export async function getPartner(id: string): Promise<Partner | null> {
  const db = await getEngine()
  const row = await db.get<PartnerRow>('SELECT * FROM partners WHERE id = ?', [id])
  return row ? toPartner(row) : null
}

export async function getPartnerByEmail(email: string): Promise<Partner | null> {
  const db = await getEngine()
  const row = await db.get<PartnerRow>('SELECT * FROM partners WHERE email = ?', [email.trim().toLowerCase()])
  return row ? toPartner(row) : null
}

export async function listPartners(): Promise<Partner[]> {
  const db = await getEngine()
  const rows = await db.all<PartnerRow>('SELECT * FROM partners ORDER BY created_at DESC')
  return rows.map(toPartner)
}

export async function updatePartner(
  id: string,
  patch: { name?: string; status?: PartnerStatus; data?: PartnerData },
): Promise<void> {
  const existing = await getPartner(id)
  if (!existing) return
  const db = await getEngine()
  await db.run('UPDATE partners SET name = ?, status = ?, data = ?, updated_at = ? WHERE id = ?', [
    patch.name ?? existing.name,
    patch.status ?? existing.status,
    JSON.stringify(patch.data ?? existing.data),
    now(),
    id,
  ])
}

/** Store a password hash and move an invited partner to active. */
export async function setPartnerPassword(id: string, passwordHash: string): Promise<void> {
  const db = await getEngine()
  await db.run(
    `UPDATE partners SET password_hash = ?, status = CASE WHEN status = 'invited' THEN 'active' ELSE status END,
     updated_at = ? WHERE id = ?`,
    [passwordHash, now(), id],
  )
}

export async function getPartnerPasswordHash(id: string): Promise<string | null> {
  const db = await getEngine()
  const row = await db.get<{ password_hash: string | null }>('SELECT password_hash FROM partners WHERE id = ?', [id])
  return row?.password_hash ?? null
}

// ─── Codes ────────────────────────────────────────────────────────────────────

interface CodeRow {
  code: string
  partner_id: string
  discount_pct: string
  terms: string
  status: string
  created_at: string
}

function toCode(row: CodeRow): PartnerCode {
  return {
    code: row.code,
    partnerId: row.partner_id,
    discountPct: num(row.discount_pct),
    terms: JSON.parse(row.terms) as CodeTerms,
    status: row.status as CodeStatus,
    createdAt: row.created_at,
  }
}

export async function createCode(input: {
  code: string
  partnerId: string
  discountPct: number
  terms: CodeTerms
}): Promise<PartnerCode> {
  const db = await getEngine()
  const at = now()
  await db.run(
    `INSERT INTO partner_codes (code, partner_id, discount_pct, terms, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.code, input.partnerId, String(input.discountPct), JSON.stringify(input.terms), 'active', at],
  )
  return { ...input, status: 'active', createdAt: at }
}

export async function getCode(code: string): Promise<PartnerCode | null> {
  const db = await getEngine()
  const row = await db.get<CodeRow>('SELECT * FROM partner_codes WHERE code = ?', [code])
  return row ? toCode(row) : null
}

export async function listCodes(partnerId: string): Promise<PartnerCode[]> {
  const db = await getEngine()
  const rows = await db.all<CodeRow>('SELECT * FROM partner_codes WHERE partner_id = ? ORDER BY created_at DESC', [
    partnerId,
  ])
  return rows.map(toCode)
}

export async function listAllCodes(): Promise<PartnerCode[]> {
  const db = await getEngine()
  return (await db.all<CodeRow>('SELECT * FROM partner_codes')).map(toCode)
}

export async function updateCode(
  code: string,
  patch: { discountPct?: number; terms?: CodeTerms; status?: CodeStatus },
): Promise<void> {
  const existing = await getCode(code)
  if (!existing) return
  const db = await getEngine()
  await db.run('UPDATE partner_codes SET discount_pct = ?, terms = ?, status = ? WHERE code = ?', [
    String(patch.discountPct ?? existing.discountPct),
    JSON.stringify(patch.terms ?? existing.terms),
    patch.status ?? existing.status,
    code,
  ])
}

// ─── Terms ────────────────────────────────────────────────────────────────────

interface TermsRow {
  id: string
  partner_id: string
  first_order_pct: string
  renewal_pct: string
  renewal_months: string
  payout: string
  effective_from: string
  note: string | null
  created_by: string | null
  created_at: string
}

function toTerms(row: TermsRow): PartnerTerms {
  return {
    id: row.id,
    partnerId: row.partner_id,
    firstOrderPct: num(row.first_order_pct),
    renewalPct: num(row.renewal_pct),
    renewalMonths: num(row.renewal_months),
    payout: JSON.parse(row.payout) as PayoutTerms,
    effectiveFrom: row.effective_from,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

/** Append a terms row. Never updates — that is the whole point of the table. */
export async function addTerms(
  input: Omit<PartnerTerms, 'id' | 'createdAt'>,
): Promise<PartnerTerms> {
  const db = await getEngine()
  const at = now()
  const terms: PartnerTerms = { ...input, id: newId('ptrm'), createdAt: at }
  await db.run(
    `INSERT INTO partner_terms
       (id, partner_id, first_order_pct, renewal_pct, renewal_months, payout, effective_from, note, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      terms.id,
      terms.partnerId,
      String(terms.firstOrderPct),
      String(terms.renewalPct),
      String(terms.renewalMonths),
      JSON.stringify(terms.payout),
      terms.effectiveFrom,
      terms.note,
      terms.createdBy,
      at,
    ],
  )
  return terms
}

export async function listTerms(partnerId: string): Promise<PartnerTerms[]> {
  const db = await getEngine()
  const rows = await db.all<TermsRow>(
    'SELECT * FROM partner_terms WHERE partner_id = ? ORDER BY effective_from DESC',
    [partnerId],
  )
  return rows.map(toTerms)
}
