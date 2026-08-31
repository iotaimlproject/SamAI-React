# AGENTS.md

## Project

This is a Vite + React dashboard for a Node-RED websocket-based control panel.

## Commands

- Install: `pnpm install`
- Start dev server: `pnpm dev`
- Build: `pnpm build`
- Lint: `pnpm lint`
- Preview: `pnpm preview`

## Setup

Requires `VITE_DEEPGRAM_API_KEY` in `.env`:

```env
VITE_DEEPGRAM_API_KEY=your_deepgram_api_key_here
```

## Code conventions

- Keep business logic and websocket logic in `src/services`.
- Prefer small, reusable functions over large component-local logic.
- Keep React state updates direct and predictable.
- Do not add framework-level abstractions unless the issue clearly warrants it.
- Keep code simple, fast, and readable.
- Avoid unnecessary comments.
- Use the existing `NODE_RED_WS_PATHS` / `NODE_RED_WS_URLS` constants from `src/services/nodeRedWebSocket.js` instead of hardcoded websocket paths or URLs.

## Websocket rules

- All Node-RED websocket logic belongs in `src/services/nodeRedWebSocket.js`.
- Reconnects should be automatic and bounded (exponential backoff capped at 30s, see `RECONNECT` in `nodeRedWebSocket.js`).
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

Microphone -> Deepgram STT (`src/services/deepgram.js` + `src/features/voice/useVoiceCapture.js`) -> Node-RED (`/ws/speak`) -> Node-RED Processing -> Node-RED TTS response (`/ws/voice`) -> `src/features/voice/voiceService.js` -> Deepgram TTS -> Audio Playback

## Key files

- `src/app/App.jsx` — UI and state wiring (canonical; `src/App.jsx` is a legacy shim)
- `src/services/nodeRedWebSocket.js` — websocket connection manager (exports `NODE_RED_WS_PATHS`, `NODE_RED_WS_URLS`, `getNodeRedSocket`, `sendNodeRedMessage`, `closeNodeRedSocket`)
- `src/services/deepgram.js` — Deepgram STT/TTS integration
- `src/features/voice/useVoiceCapture.js` — microphone capture hook
- `src/features/voice/voiceService.js` — voice pipeline glue to Node-RED
- `src/components/ui/Led.jsx` / `src/components/ui/Toggle.jsx` — reusable UI
- `src/main.jsx` — app entry point (imports `./app/App.jsx`)
- `vite.config.js` — Vite config

## Notes

- This project is intentionally lightweight; avoid overengineering and keep the architecture easy to follow.
- Prefer existing patterns and minimal changes when adding features.
- Package manager is `pnpm` (see `pnpm-lock.yaml`). Do not use `npm` — remove `package-lock.json` if present and run `pnpm install`.
