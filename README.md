# SamAI Dashboard

Industrial realtime manufacturing control panel — Next.js 15 (App Router, TSX) + shadcn/ui + Tailwind, WebSocket control for Node-RED, voice control via Deepgram STT/TTS. Migrated from Vite+React (see `MIGRATION.md`).

## Features

- Real-time machine status and OEE metrics (availability/performance/quality)
- Voice commands: microphone → Deepgram STT → `/ws/speak` → Node-RED → `/ws/voice` → Deepgram TTS
- 8 independent Node-RED WebSockets with bounded queue + exponential reconnect (capped 30s)
- Dark/Light theme (next/font IBM Plex Sans/Mono)
- Responsive industrial card layout (460px, mobile full-bleed)
- Production order management (SlNo/Item/SetQty/DateTime, placeOrder/stop/reset)

## Setup

### Install dependencies

```bash
pnpm install
```

### Environment Configuration

Create `.env.local` (preferred) — `.env` with `VITE_DEEPGRAM_API_KEY` still works via fallback:

```env
NEXT_PUBLIC_DEEPGRAM_API_KEY=your_40char_project_api_key
# or server-only (hides key via /api/deepgram/*):
DEEPGRAM_API_KEY=your_40char_project_api_key
```

See `.env.example` for full template.

### Development

```bash
pnpm dev     # Next dev on 0.0.0.0:5175
```

### Build

```bash
pnpm build   # Next production build
pnpm start   # Next start on 0.0.0.0:4173
```

### Lint

```bash
pnpm lint    # next lint (eslint.config.mjs → next/core-web-vitals)
```

## Architecture

- `app/` — Next App Router (`layout.tsx` fonts+globals, `page.tsx` force-dynamic, `globals.css` Tailwind tokens)
- `app/components/dashboard/DashboardClient.tsx` — `'use client'` UI + 8 WS + `useVoiceCapture`
- `components/ui/` — shadcn/ui (`button`, `card`, `switch`, `input`, `select`, `label`, `separator`, `badge`) + custom `led.tsx`
- `lib/` — `nodeRedWebSocket.ts`, `deepgram.ts`, `voiceService.ts`, `utils.ts` (migrated from `src/services`)
- `hooks/useVoiceCapture.ts` — microphone hook (migrated from `src/features/voice`)
- `app/api/deepgram/` — `tts/route.ts` + `token/route.ts` server proxies (hide `DEEPGRAM_API_KEY`)
- Legacy Vite reference: `src/` (kept for diff until fully removed), `vite.config.js` deprecated

## WebSocket Endpoints

- `/ws/machine` — Machine on/off state
- `/ws/dashboard` — Order and production data
- `/ws/speak` — Voice input from dashboard to Node-RED
- `/ws/voice` — Voice output from Node-RED to dashboard
- `/ws/stop` — Production stop signal
- `/ws/reset` — Production reset
- `/ws/placeOrder` — Order placement
- `/ws/dateTime` — Scheduled production time

## Voice Pipeline

Microphone -> Deepgram STT (`lib/deepgram.ts` + `hooks/useVoiceCapture.ts`) -> Node-RED (`/ws/speak`) -> Node-RED Processing -> Node-RED TTS response (`/ws/voice`) -> `lib/voiceService.ts` -> Deepgram TTS (`lib/deepgram.ts` or `app/api/deepgram/tts`) -> Audio Playback
