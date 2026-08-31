# Voice Capture Debugging Guide

## Quick Start

1. **Set your Deepgram API key** in `.env`:
   ```
   VITE_DEEPGRAM_API_KEY=your_actual_key_here
   ```

2. **Start the dev server**:
   ```bash
   npm run dev
   ```

3. **Open the browser console** (F12 → Console tab)

4. **Click "Speak" button** and watch the console logs

---

## Expected Console Log Flow

### ✅ What you should see:

```
[App] Speak button clicked. Current enabled: false -> toggling to: true
[useVoiceCapture] Effect triggered. enabled: true apiKey exists: true
[useVoiceCapture] Starting STT initialization...
[startMicrophoneStt] Starting initialization...
[startMicrophoneStt] Requesting microphone access...
  (Browser will ask for microphone permission)
[startMicrophoneStt] Microphone access granted
[startMicrophoneStt] Creating STT socket...
[createSttSocket] Creating WebSocket to: wss://api.deepgram.com/v1/listen?...
[startMicrophoneStt] STT socket created
[startMicrophoneStt] Creating audio context...
[startMicrophoneStt] Audio context created
[startMicrophoneStt] Creating audio worklet...
[createAudioWorklet] Creating worklet...
[createAudioWorklet] Adding module...
[createAudioWorklet] Module added, creating node...
[createAudioWorklet] Node created successfully
[startMicrophoneStt] Audio worklet created
[startMicrophoneStt] Connecting audio nodes...
[startMicrophoneStt] Audio nodes connected - READY!
[useVoiceCapture] Session started successfully
[Deepgram STT] Socket opened!
[useVoiceCapture.onOpen] STT socket opened!
```

Then when you speak:
```
[Deepgram STT] Transcript: hello isFinal: false
[useVoiceCapture.onTranscript] Received: hello isFinal: false
[Deepgram STT] Transcript: hello world isFinal: true
[useVoiceCapture.onTranscript] Received: hello world isFinal: true
[useVoiceCapture] Final transcript sent to Node-RED
```

---

## Debugging Issues

### Issue 1: "API key missing"
**Error**: `[useVoiceCapture] API KEY MISSING! Set VITE_DEEPGRAM_API_KEY in .env`

**Fix**:
1. Create `.env` file in project root
2. Add: `VITE_DEEPGRAM_API_KEY=your_key_here`
3. Restart dev server (`npm run dev`)
4. Refresh browser

---

### Issue 2: Microphone access denied
**Error**: `[startMicrophoneStt] CRITICAL FAILURE: NotAllowedError: Permission denied`

**Fix**:
1. Browser → Settings → Privacy → Microphone
2. Allow access to `localhost:5173` (or your dev URL)
3. Refresh page
4. Try again

---

### Issue 3: Audio worklet error
**Error**: `[createAudioWorklet] CRITICAL ERROR: ...`

**Fix**:
- This is a browser compatibility issue
- Check if browser supports AudioWorklet (Chrome, Edge, Firefox do)
- Safari might not work

---

### Issue 4: WebSocket error at Deepgram
**Error**: `[createSttSocket] Socket error: ...`

**Likely causes**:
1. **Invalid API key** - Double-check your key
2. **Network blocked** - Check firewall/VPN
3. **Deepgram service down** - Try later

---

### Issue 5: No transcripts received
**Error**: Socket opens but no `[Deepgram STT] Transcript:` messages

**Check**:
1. Are you speaking clearly?
2. Is microphone working? (Test in Discord, Teams, etc.)
3. Check volume levels
4. Try longer sentences

---

## What Each Log Means

| Log | Meaning | Status |
|-----|---------|--------|
| `[App] Speak button clicked` | User clicked button | ✅ Normal |
| `[useVoiceCapture] Effect triggered` | Hook initializing | ✅ Normal |
| `[startMicrophoneStt] Requesting microphone access` | Asking for mic permission | ✅ Normal (browser will prompt) |
| `[startMicrophoneStt] Microphone access granted` | User approved access | ✅ Normal |
| `[createSttSocket] Creating WebSocket` | Connecting to Deepgram | ✅ Normal |
| `[Deepgram STT] Socket opened!` | Connected to Deepgram | ✅ READY FOR SPEECH |
| `[Deepgram STT] Transcript:` | Speech recognized | ✅ Working! |
| `[useVoiceCapture] Final transcript sent to Node-RED` | Sent to backend | ✅ Complete |

---

## Commands for Testing

### Terminal 1 - Start Dev Server
```bash
cd c:\Users\IDEA LAB\Downloads\my-dashboard
npm run dev
```

### Terminal 2 - Watch Logs (optional)
Keep browser console open (F12)

### Terminal 3 - Production Build
```bash
npm run build
npm run preview  # Test the build locally
```

---

## Immediate Next Steps

1. Check `.env` file exists with API key
2. Open browser console (F12)
3. Click "Speak" button
4. Copy ALL console logs
5. Share them with this format:

```
Button click logs:
[... paste logs here ...]

Error messages (if any):
[... paste here ...]
```

Then I can pinpoint the exact issue.
