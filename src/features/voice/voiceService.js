import { speakNodeRedText } from '../../services/deepgram';
import { NODE_RED_WS_PATHS, sendNodeRedMessage } from '../../services/nodeRedWebSocket';

export function sendVoiceToNodeRed(transcript) {
  if (!transcript?.trim()) return false;
  const payload = {
    device: 'speak',
    value: transcript,
    text: transcript,
    source: 'dashboard',
  };
  console.log('[voiceService] Sending STT to Node-RED /ws/speak:', payload);
  return sendNodeRedMessage(NODE_RED_WS_PATHS.speak, payload);
}

function normalizeVoicePayload(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return null;
    try {
      const parsed = JSON.parse(t);
      return normalizeVoicePayload(parsed);
    } catch {
      return { device: 'voice', value: t, text: t, source: 'node-red' };
    }
  }
  if (typeof raw === 'object') {
    const text = raw.value ?? raw.text ?? raw.payload ?? raw.data ?? raw.message ?? '';
    if (!text || typeof text !== 'string' || !text.trim()) return null;
    return {
      ...raw,
      device: raw.device || 'voice',
      event: raw.event,
      value: text.trim(),
      text: text.trim(),
      source: raw.source || 'node-red',
    };
  }
  return null;
}

export async function handleSpeakResponse(rawPayload) {
  const payload = normalizeVoicePayload(rawPayload);
  console.log('[voiceService] handleSpeakResponse raw:', rawPayload, 'normalized:', payload);

  if (!payload) {
    console.warn('[voiceService] No text in voice payload – ignoring');
    return false;
  }
  if (payload.source === 'dashboard') {
    console.log('[voiceService] Ignoring echo from dashboard');
    return false;
  }

  const text = payload.text || payload.value;
  if (!text?.trim()) return false;

  const apiKey = import.meta.env.VITE_DEEPGRAM_API_KEY;
  if (!apiKey) {
    console.warn('[voiceService] VITE_DEEPGRAM_API_KEY missing – using browser TTS fallback');
  }

  try {
    console.log('[voiceService] Playing TTS:', text.slice(0, 80));
    const audio = await speakNodeRedText({ text, apiKey });
    console.log('[voiceService] TTS started:', audio);
    return true;
  } catch (err) {
    console.error('[voiceService] TTS playback failed:', err);
    return false;
  }
}

export { normalizeVoicePayload };
