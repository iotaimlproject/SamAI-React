import { speakNodeRedText } from '../../services/deepgram';
import { getNodeRedSocket, sendNodeRedMessage } from '../../services/nodeRedWebSocket';

export function sendVoiceToNodeRed(transcript) {
  const payload = {
    device: 'speak',
    value: transcript,
    text: transcript,
    source: 'dashboard',
  };

  const socket = getNodeRedSocket('/ws/speak');
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
    return true;
  }

  return sendNodeRedMessage('/ws/speak', payload);
}

export async function handleSpeakResponse(payload) {
  const text = payload?.value ?? payload?.text ?? '';
  if (!text || !payload || payload.source === 'dashboard') return false;

  if (payload.device === 'voice' || payload.event === 'tts') {
    await speakNodeRedText({ text, apiKey: import.meta.env.VITE_DEEPGRAM_API_KEY });
    return true;
  }

  return false;
}
