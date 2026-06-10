import type { ExportRow } from './types'

export interface SheetExportResult {
  success: boolean
  idea_id?: string
  error?: string
}

const isMockMode = !process.env.NEXT_PUBLIC_SHEETS_ENABLED

export async function getNextIdeaId(): Promise<string> {
  if (isMockMode) {
    return 'G-042'
  }

  const res = await fetch('/api/sheets/next-id')
  if (!res.ok) return 'G-001'
  const data = await res.json()
  return data.nextId
}

export async function appendExportRow(row: ExportRow): Promise<SheetExportResult> {
  if (isMockMode) {
    await new Promise((r) => setTimeout(r, 800))
    return { success: true, idea_id: row.idea_id }
  }

  const res = await fetch('/api/sheets/append', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ row }),
  })

  if (!res.ok) {
    const err = await res.text()
    return { success: false, error: err || 'Failed to append row to Google Sheets' }
  }

  return res.json()
}

export async function readExistingRows(): Promise<ExportRow[]> {
  if (isMockMode) {
    return []
  }

  const res = await fetch('/api/sheets/read')
  if (!res.ok) return []
  return res.json()
}
