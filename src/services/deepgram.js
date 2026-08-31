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
    const err = new Error('Deepgram API key is missing. Set VITE_DEEPGRAM_API_KEY in the environment.');
    console.error('[createSttSocket] ERROR:', err.message);
    throw err;
  }

  const url = makeSttUrl(options);
  console.log('[createSttSocket] Creating WebSocket to:', url);

  const socket = new WebSocket(url, ['token', apiKey]);
  socket.binaryType = 'arraybuffer';

  socket.onopen = () => {
    console.log('[Deepgram STT] Socket opened!');
    onOpen?.();
  };

  socket.onmessage = (event) => {
    const message = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);

    try {
      const payload = JSON.parse(message);
      const transcript = payload.channel?.alternatives?.[0]?.transcript ?? '';
      const isFinal = Boolean(payload.is_final);

      if (transcript) {
        console.log('[Deepgram STT] Transcript:', transcript, 'final:', isFinal);
        onTranscript?.({ transcript, isFinal, payload });
      }
    } catch (e) {
      console.error('[Deepgram STT] Parse error:', e, 'data:', message);
      onError?.(e);
    }
  };

  socket.onerror = (event) => {
    console.error('[Deepgram STT] Socket error:', event);
    onError?.(event);
  };

  socket.onclose = () => {
    console.log('[Deepgram STT] Socket closed');
    onClose?.();
  };

  return socket;
}

async function createAudioWorklet(audioContext, socket) {
  console.log('[createAudioWorklet] Creating worklet...');
  
  const workletCode = `
    class PCMProcessor extends AudioWorkletProcessor {
      process(inputs) {
        const input = inputs[0]?.[0];
        if (!input) return true;

        const pcm = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          pcm[i] = Math.max(-1, Math.min(1, input[i])) * 0x7fff;
        }

        this.port.postMessage({ pcm: pcm.buffer }, [pcm.buffer]);
        return true;
      }
    }
    registerProcessor('pcm-processor', PCMProcessor);
  `;

  const blob = new Blob([workletCode], { type: 'application/javascript' });
  const workletUrl = URL.createObjectURL(blob);

  try {
    console.log('[createAudioWorklet] Adding module...');
    await audioContext.audioWorklet.addModule(workletUrl);
    console.log('[createAudioWorklet] Module added, creating node...');
    
    const processor = new AudioWorkletNode(audioContext, 'pcm-processor');
    console.log('[createAudioWorklet] Node created successfully');

    processor.port.onmessage = (event) => {
      if (socket.readyState !== WebSocket.OPEN) {
        console.warn('[PCMProcessor] Socket not open, dropping audio data');
        return;
      }
      socket.send(event.data.pcm);
    };

    return processor;
  } catch (err) {
    console.error('[createAudioWorklet] CRITICAL ERROR:', err, err.stack);
    throw err;
  } finally {
    URL.revokeObjectURL(workletUrl);
  }
}

export async function startMicrophoneStt({
  apiKey = DEFAULT_API_KEY,
  onTranscript,
  onOpen,
  onClose,
  onError,
  options = {},
} = {}) {
  console.log('[startMicrophoneStt] Starting initialization...');

  if (!apiKey) {
    const err = new Error('Deepgram API key missing. Set VITE_DEEPGRAM_API_KEY.');
    console.error('[startMicrophoneStt]', err.message);
    onError?.(err);
    throw err;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    const err = new Error('Microphone access not supported.');
    console.error('[startMicrophoneStt]', err.message);
    onError?.(err);
    throw err;
  }

  let stream, audioContext, source, processor;

  try {
    console.log('[startMicrophoneStt] Requesting microphone access...');
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    console.log('[startMicrophoneStt] Microphone access granted');

    console.log('[startMicrophoneStt] Creating STT socket...');
    const socket = createSttSocket({
      apiKey,
      onTranscript,
      onOpen,
      onClose,
      onError,
      options,
    });
    console.log('[startMicrophoneStt] STT socket created');

    console.log('[startMicrophoneStt] Creating audio context...');
    audioContext = new AudioContext({ sampleRate: 16000 });
    source = audioContext.createMediaStreamSource(stream);
    console.log('[startMicrophoneStt] Audio context created');

    console.log('[startMicrophoneStt] Creating audio worklet...');
    processor = await createAudioWorklet(audioContext, socket);
    console.log('[startMicrophoneStt] Audio worklet created');

    console.log('[startMicrophoneStt] Connecting audio nodes...');
    source.connect(processor);
    processor.connect(audioContext.destination);
    console.log('[startMicrophoneStt] Audio nodes connected - READY!');

    return {
      stream,
      socket,
      stop() {
        console.log('[STT.stop] Stopping...');
        try {
          processor?.disconnect();
          source?.disconnect();
          stream?.getTracks().forEach((track) => track.stop());

          if (socket?.readyState === WebSocket.OPEN) {
            socket.close();
          }

          if (audioContext?.state !== 'closed') {
            audioContext.close();
          }
          console.log('[STT.stop] Stopped successfully');
        } catch (e) {
          console.error('[STT.stop] Error:', e);
        }
      },
    };
  } catch (err) {
    console.error('[startMicrophoneStt] CRITICAL FAILURE:', err, err.stack);
    stream?.getTracks().forEach((track) => track.stop());
    audioContext?.close?.();
    onError?.(err);
    throw err;
  }
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
  if (!text) return null;

  try {
    const blob = await speakText({ text, apiKey, model, speed, expressivity });
    const audio = playAudioBlob(blob);
    audio.onerror = () => {
      console.warn('Audio playback failed, trying browser fallback');
      useBrowserFallback(text);
    };
    return audio;
  } catch (error) {
    console.warn('Deepgram TTS failed, using browser fallback:', error);
    return useBrowserFallback(text);
  }
}

function useBrowserFallback(text) {
  if (!('speechSynthesis' in window)) {
    console.error('Speech synthesis not supported');
    return null;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
  return utterance;
}
