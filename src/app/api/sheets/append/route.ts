import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import type { ExportRow } from '@/lib/types'

const COLUMN_ORDER: (keyof ExportRow)[] = [
  'idea_id', 'status', 'priority', 'title', 'content_category', 'target_viewer', 'pain_point',
  'core_tension', 'experience_type', 'post_type', 'carousel_story_arc', 'slide_count',
  'slide_1_role', 'slide_1_hook', 'slide_2_role', 'slide_2_problem',
  'slide_3_role', 'slide_3_mechanism', 'slide_4_role', 'slide_4_takeaway',
  'slide_5_role', 'slide_5_cta', 'visual_style_hint', 'ai_visual_priority',
  'safe_zone_priority', 'preferred_text_position', 'text_density', 'layout_risk',
  'platform_ui_risk', 'claim_risk', 'claim_safety_notes',
  'caption', 'caption_angle', 'comment_trigger', 'hashtags_hint',
  'generated_at', 'learning_tag',
]

export async function POST(req: NextRequest) {
  try {
    const { row }: { row: ExportRow } = await req.json()

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })

    const sheets = google.sheets({ version: 'v4', auth })
    const sheetId = process.env.GOOGLE_SHEET_ID
    const tabName = process.env.GOOGLE_SHEET_TAB ?? 'Content Pipeline'

    const values = [COLUMN_ORDER.map((col) => String(row[col] ?? ''))]

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${tabName}!A:A`,
      valueInputOption: 'RAW',
      requestBody: { values },
    })

    return NextResponse.json({ success: true, idea_id: row.idea_id })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
