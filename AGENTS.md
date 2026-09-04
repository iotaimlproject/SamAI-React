# AGENTS.md

## Project

Next.js 15 App Router (TSX) + shadcn/ui industrial realtime dashboard for Node-RED websocket control panel. Migrated from Vite+React (see `MIGRATION.md`). Legacy Vite sources remain under `src/` for reference but canonical code is `app/`, `components/`, `lib/`, `hooks/`.

## Commands

- Install: `pnpm install`
- Start dev server: `pnpm dev` (Next dev on `0.0.0.0:5175`)
- Build: `pnpm build` (Next.js production build)
- Lint: `pnpm lint` (next lint via eslint.config.mjs → next/core-web-vitals)
- Start prod: `pnpm start` (Next start on `0.0.0.0:4173`)

## Setup

Requires Deepgram API key. `NEXT_PUBLIC_DEEPGRAM_API_KEY` for client STT/TTS parity with legacy `VITE_DEEPGRAM_API_KEY`, or server-only `DEEPGRAM_API_KEY` (recommended – hides key via `app/api/deepgram/*`):

```env
# .env.local – client (parity)
NEXT_PUBLIC_DEEPGRAM_API_KEY=your_deepgram_api_key_here

# OR server-only (industrial, uses app/api/deepgram/tts & /token proxies)
DEEPGRAM_API_KEY=your_deepgram_api_key_here
```

Legacy `VITE_DEEPGRAM_API_KEY` in `.env` still works via fallback in `lib/deepgram.ts` / `lib/voiceService.ts` / `hooks/useVoiceCapture.ts`.

See `.env.example` for template. `NEXT_PUBLIC_NODE_RED_HOST/PROTOCOL` optional (defaults to `wss://node-dev.iotaiml.dpdns.org`).

## Code conventions

- Keep business logic and websocket logic in `lib/` (migrated from `src/services`).
- Prefer small, reusable functions over large component-local logic.
- Keep React state updates direct and predictable.
- Do not add framework-level abstractions unless the issue clearly warrants it.
- Keep code simple, fast, and readable.
- Avoid unnecessary comments.
- Use `NODE_RED_WS_PATHS` / `NODE_RED_WS_URLS` from `lib/nodeRedWebSocket.ts` instead of hardcoded websocket paths or URLs.
- All client WebSocket/voice code must be `'use client'` with `typeof window` guards (SSR safe).

## Websocket rules

- All Node-RED websocket logic belongs in `lib/nodeRedWebSocket.ts`.
- Reconnects should be automatic and bounded (exponential backoff capped at 30s, see `RECONNECT` in `nodeRedWebSocket.ts`).
- Message sending should fail gracefully when the socket is not open (bounded queue via `sendNodeRedMessage`, do not call `socket.send` directly).
- Cleanup should close sockets and cancel timers without leaving stale connections behind (call `closeNodeRedSocket(path)` in `useEffect` cleanup).

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

## Key files

- `app/components/dashboard/DashboardClient.tsx` — UI and state wiring (`'use client'`, 8 independent WS, shadcn)
- `app/layout.tsx` — Next.js root layout (fonts, `app/globals.css`, metadata)
- `app/page.tsx` — server shell (`dynamic='force-dynamic'`)
- `app/globals.css` — Tailwind + design tokens (ported from `src/index.css` + `src/App.css`)
- `lib/nodeRedWebSocket.ts` — websocket connection manager (exports `NODE_RED_WS_PATHS`, `NODE_RED_WS_URLS`, `getNodeRedSocket`, `sendNodeRedMessage`, `closeNodeRedSocket`)
- `lib/deepgram.ts` — Deepgram STT/TTS integration (client-safe, WeakMap AudioWorklet fix)
- `lib/voiceService.ts` — voice pipeline glue to Node-RED
- `hooks/useVoiceCapture.ts` — microphone capture hook (`'use client'`)
- `components/ui/*` — shadcn primitives (`button`, `card`, `switch`, `input`, `select`, `label`, `separator`, `badge`) + custom `led.tsx`
- `lib/utils.ts` — `cn()` helper
- `app/api/deepgram/tts/route.ts` / `token/route.ts` — server proxies (hide `DEEPGRAM_API_KEY`)
- `next.config.mjs` — CSP `connect-src wss://node-dev.iotaiml.dpdns.org wss://api.deepgram.com`
- Legacy (reference): `src/app/App.jsx`, `src/services/*`, `vite.config.js`, `src/main.jsx`

## Notes

- This project is intentionally lightweight; avoid overengineering and keep the architecture easy to follow.
- Prefer existing patterns and minimal changes when adding features.
- Package manager is `pnpm` (see `pnpm-lock.yaml`). Do not use `npm` — remove `package-lock.json` if present and run `pnpm install`.
- Next.js `app/` is canonical; `src/` is legacy Vite kept for diff reference until fully removed.
