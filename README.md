# SamAI Dashboard

A real-time manufacturing control panel powered by React + Vite with WebSocket integration to Node-RED and voice control via DeepGram.

## Features

- Real-time machine status and OEE metrics
- Voice commands via DeepGram STT/TTS
- WebSocket-based Node-RED integration
- Dark/Light theme toggle
- Responsive dashboard UI
- Production order management

## Setup

### Install dependencies

```bash
npm install
```

### Environment Configuration

Create a `.env` file in the project root:

```env
VITE_DEEPGRAM_API_KEY=your_deepgram_api_key_here
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Lint

```bash
npm run lint
```

## Architecture

- `src/app/` — Main app shell and UI logic
- `src/services/` — WebSocket and DeepGram integrations
- `src/features/` — Voice capture and pipeline handling
- `src/components/` — Reusable UI components

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

Microphone → Deepgram STT → Node-RED (`/ws/speak`) → Node-RED Processing → Node-RED TTS response (`/ws/voice`) → Deepgram TTS → Audio Playback
