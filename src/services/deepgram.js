const DEFAULT_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY || '';

export const DEEPGRAM = {
  sttUrl: 'wss://api.deepgram.com/v1/listen',
  ttsUrl: 'https://api.deepgram.com/v2/speak',
};

export function makeSttUrl(options = {}) {
  const params = new URLSearchParams({
    endpointing: 'false',
    language: 'en',
    model: 'nova-3',
    encoding: 'linear16',
    sample_rate: '16000',
    ...options,
  });

  return `${DEEPGRAM.sttUrl}?${params.toString()}`;
}

export function createSttSocket({
  apiKey = DEFAULT_API_KEY,
  onTranscript,
  onOpen,
  onClose,
  onError,
  options = {},
} = {}) {
  if (!apiKey) {
    throw new Error('Deepgram API key is missing. Set VITE_DEEPGRAM_API_KEY in the environment.');
  }

  const socket = new WebSocket(makeSttUrl(options), ['token', apiKey]);
  socket.binaryType = 'arraybuffer';

  socket.onopen = () => onOpen?.();

  socket.onmessage = (event) => {
    const message = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);

    try {
      const payload = JSON.parse(message);
      const transcript = payload.channel?.alternatives?.[0]?.transcript ?? '';
      const isFinal = Boolean(payload.is_final);

      if (transcript) {
        onTranscript?.({ transcript, isFinal, payload });
      }
    } catch {
      onError?.(event);
    }
  };

  socket.onerror = (event) => onError?.(event);
  socket.onclose = () => onClose?.();

  return socket;
}

export async function startMicrophoneStt({
  apiKey = DEFAULT_API_KEY,
  onTranscript,
  onOpen,
  onClose,
  onError,
  options = {},
} = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone access is not supported in this browser.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      sampleRate: 16000,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });

  const socket = createSttSocket({
    apiKey,
    onTranscript,
    onOpen,
    onClose,
    onError,
    options,
  });

  const audioContext = new AudioContext({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);

  source.connect(processor);
  processor.connect(audioContext.destination);

  processor.onaudioprocess = (event) => {
    if (socket.readyState !== WebSocket.OPEN) return;

    const input = event.inputBuffer.getChannelData(0);
    const pcm = new Int16Array(input.length);

    for (let i = 0; i < input.length; i += 1) {
      pcm[i] = Math.max(-1, Math.min(1, input[i])) * 0x7fff;
    }

    socket.send(pcm.buffer);
  };

  return {
    stream,
    socket,
    stop() {
      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach((track) => track.stop());

      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }

      if (audioContext.state !== 'closed') {
        audioContext.close();
      }
    },
  };
}

export async function speakText({
  text,
  apiKey = DEFAULT_API_KEY,
  model = 'flux-priya-en',
  speed = 1,
  expressivity = 0,
} = {}) {
  if (!apiKey) {
    throw new Error('Deepgram API key is missing. Set VITE_DEEPGRAM_API_KEY in the environment.');
  }

  const response = await fetch(`${DEEPGRAM.ttsUrl}?model=${model}&speed=${speed}&expressivity=${expressivity}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Deepgram TTS failed: ${errorText}`);
  }

  return response.blob();
}

export function playAudioBlob(blob) {
  const audioUrl = URL.createObjectURL(blob);
  const audio = new Audio(audioUrl);
  audio.play();
  return audio;
}

export async function speakNodeRedText({
  text,
  apiKey = DEFAULT_API_KEY,
  model = 'flux-priya-en',
  speed = 1,
  expressivity = 0,
} = {}) {
  const blob = await speakText({ text, apiKey, model, speed, expressivity });
  return playAudioBlob(blob);
}
