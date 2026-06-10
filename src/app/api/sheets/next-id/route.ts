import { NextResponse } from 'next/server'
import { google } from 'googleapis'

export async function GET() {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })

    const sheets = google.sheets({ version: 'v4', auth })
    const sheetId = process.env.GOOGLE_SHEET_ID
    const tabName = process.env.GOOGLE_SHEET_TAB ?? 'Content Pipeline'

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!A:A`,
    })

    const values = res.data.values ?? []
    let highest = 0
    for (const row of values) {
      const cell = String(row[0] ?? '')
      const match = cell.match(/^G-(\d+)$/)
      if (match) highest = Math.max(highest, parseInt(match[1]))
    }

    const nextId = `G-${String(highest + 1).padStart(3, '0')}`
    return NextResponse.json({ nextId })
  } catch (e) {
    return NextResponse.json({ nextId: 'G-001' })
  }
}
