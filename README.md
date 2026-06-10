# Content Pipeline Studio

Mobile-first AI TikTok carousel idea builder for CHRGD.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000 on mobile or in DevTools mobile view (360px+).

## Mock mode

Works out of the box — no API keys needed. All 8 builder stages run with realistic CHRGD example data.

## Add live AI

Copy `.env.example` to `.env.local` and add:
- `OPENAI_API_KEY` — enables live idea generation
- `NEXT_PUBLIC_OPENAI_API_KEY` — same value, used client-side

## Add Google Sheets export

Add to `.env.local`:
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_SHEET_ID`
- `GOOGLE_SHEET_TAB` (default: Content Pipeline)

Share your Sheet with the service account email.

## User journey (8 stages)

1. Idea Spark — type a topic or tap a quick chip
2. Swipe cards — swipe through AI-generated ideas
3. Pressure test — scores across 10 dimensions
4. Carousel builder — 5-slide structure
5. Interaction optimiser — comments / saves / shares / etc.
6. Visual director — style system for your n8n image pipeline
7. Claim safety — flags risky supplement/health language
8. TikTok preview + Export review — append to Google Sheets as queued

## Stack

Next.js 15 · App Router · TypeScript · Tailwind CSS v4 · OpenAI API · Google Sheets API
