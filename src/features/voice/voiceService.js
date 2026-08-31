import { speakNodeRedText } from '../../services/deepgram';
import { getNodeRedSocket, sendNodeRedMessage } from '../../services/nodeRedWebSocket';

export function sendVoiceToNodeRed(transcript) {
  if (!transcript?.trim()) return false;

  const payload = {
    device: 'speak',
    value: transcript,
    text: transcript,
    source: 'dashboard',
  };

  const socket = getNodeRedSocket('/ws/speak');
  if (socket?.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify(payload));
      console.log('STT sent to Node-RED:', transcript);
      return true;
    } catch (err) {
      console.error('Failed to send STT:', err);
      return sendNodeRedMessage('/ws/speak', payload);
    }
  }

  console.debug('Socket not open, queuing STT message');
  return sendNodeRedMessage('/ws/speak', payload);
}

export async function handleSpeakResponse(payload) {
  const text = payload?.value ?? payload?.text ?? '';
  if (!text || !payload || payload.source === 'dashboard') return false;

  if (payload.device === 'voice' || payload.event === 'tts') {
    try {
      console.log('Playing TTS from Node-RED:', text);
      await speakNodeRedText({ text, apiKey: import.meta.env.VITE_DEEPGRAM_API_KEY });
      return true;
    } catch (err) {
      console.error('TTS playback failed:', err);
      return false;
    }
  }

  return false;
}
