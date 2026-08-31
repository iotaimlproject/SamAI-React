# AGENTS.md

## Project

This is a Vite + React dashboard for a Node-RED websocket-based control panel.

## Commands

- Install: `npm install`
- Start dev server: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`

## Code conventions

- Keep business logic and websocket logic in `src/services`.
- Prefer small, reusable functions over large component-local logic.
- Keep React state updates direct and predictable.
- Do not add framework-level abstractions unless the issue clearly warrants it.
- Keep code simple, fast, and readable.
- Avoid unnecessary comments.
- Use the existing `NODE_RED_WS_URLS` constants instead of hardcoded websocket URLs.

## Websocket rules

- All Node-RED websocket logic belongs in `src/services/nodeRedWebSocket.js`.
- Reconnects should be automatic and bounded.
- Message sending should fail gracefully when the socket is not open.
- Cleanup should close sockets and cancel timers without leaving stale connections behind.

## Key files

- `src/App.jsx` — UI and state wiring
- `src/services/nodeRedWebSocket.js` — websocket connection manager
- `src/main.jsx` — app entry point
- `vite.config.js` — Vite config

## Notes

- This project is intentionally lightweight; avoid overengineering and keep the architecture easy to follow.
- Prefer existing patterns and minimal changes when adding features.
