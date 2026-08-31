const DEFAULT_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY || '';

export const DEEPGRAM = {
  sttUrl: 'wss://api.deepgram.com/v1/listen',
  ttsUrl: 'https://api.deepgram.com/v1/speak',
  ttsUrlV2: 'https://api.deepgram.com/v2/speak',
};

const isDev = import.meta.env.DEV;
const log = (...a) => { if (isDev) console.log(...a); };

export function makeSttUrl(options = {}) {
  const params = new URLSearchParams({
    model: 'nova-3',
    language: 'en-IN',
    encoding: 'linear16',
    sample_rate: '16000',
    channels: '1',
    interim_results: 'true',
    punctuate: 'true',
    smart_format: 'true',
    endpointing: '300',
    utterance_end_ms: '1000',
    vad_events: 'true',
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
  if (!apiKey || !apiKey.trim()) {
    const err = new Error('Deepgram API key missing. Set VITE_DEEPGRAM_API_KEY in .env and restart vite (pnpm dev).');
    console.error('[Deepgram]', err.message);
    throw err;
  }
  if (apiKey.length < 20) {
    console.warn('[Deepgram] API key looks too short – check VITE_DEEPGRAM_API_KEY');
  }
  const isJwt = apiKey.split('.').length === 3;
  if (isJwt) {
    console.warn('[Deepgram] JWT detected (from /v1/auth/grant). Browser WebSocket cannot send JWT via Sec-WebSocket-Protocol token header (length limit ~80). Use a 40-char Project API Key or pass JWT via ?access_token query param. See https://developers.deepgram.com/docs/token-based-authentication');
  }

  const url = makeSttUrl(options);
  log('[Deepgram STT] Connecting to:', url.replace(apiKey, '***'));

  const socket = new WebSocket(url, ['token', apiKey]);
  socket.binaryType = 'arraybuffer';

  socket.onopen = () => { log('[Deepgram STT] Socket opened!'); onOpen?.(); };

  socket.onmessage = (event) => {
    const message = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
    try {
      const payload = JSON.parse(message);
      if (payload.type === 'Results') {
        const alt = payload.channel?.alternatives?.[0];
        const transcript = alt?.transcript ?? '';
        const isFinal = Boolean(payload.is_final);
        const speechFinal = Boolean(payload.speech_final);
        if (transcript) onTranscript?.({ transcript, isFinal, speechFinal, payload });
      } else if (payload.type === 'Metadata') {
        log('[Deepgram] Metadata:', payload);
      }
    } catch (e) { onError?.(e); }
  };

  socket.onerror = (event) => {
    console.error('[Deepgram STT] Socket error (likely 401 auth or invalid params). Check VITE_DEEPGRAM_API_KEY and that it is a 40-char Project Key, not a JWT. Verify network allows wss://api.deepgram.com. Event:', event);
    onError?.(event);
  };

  socket.onclose = (event) => {
    log(`[Deepgram STT] Socket closed code=${event.code} reason="${event.reason}" wasClean=${event.wasClean}`);
    if (event.code === 1006) {
      console.error('[Deepgram] Abnormal closure 1006: usually 401 invalid API key, invalid query params (vad_turnoff, keep_alive as param, etc), or firewall/proxy blocking wss. Try minimal URL: wss://api.deepgram.com/v1/listen?model=nova-3&language=en-IN&encoding=linear16&sample_rate=16000&interim_results=true');
    }
    if (event.code === 1008) {
      console.error('[Deepgram] Policy violation 1008: rate limit or payload too large');
    }
    onClose?.(event);
  };

  return socket;
}

let cachedWorkletUrl = null;
const workletModulePromises = new WeakMap();

function getWorkletUrl() {
  if (cachedWorkletUrl) return cachedWorkletUrl;
  const workletCode = `
    class PCMProcessor extends AudioWorkletProcessor {
      constructor() { super(); this._buffer = new Int16Array(4096); this._pos = 0; }
      process(inputs) {
        const input = inputs[0]?.[0];
        if (!input) return true;
        for (let i = 0; i < input.length; i++) {
          let pcm = input[i] * 0x7fff;
          pcm = pcm < -0x7fff ? -0x7fff : pcm > 0x7fff ? 0x7fff : pcm | 0;
          this._buffer[this._pos++] = pcm;
          if (this._pos >= this._buffer.length) {
            const out = this._buffer.buffer.slice(0);
            this.port.postMessage({ pcm: out }, [out]);
            this._buffer = new Int16Array(4096);
            this._pos = 0;
          }
        }
        return true;
      }
    }
    registerProcessor('pcm-processor', PCMProcessor);
  `;
  const blob = new Blob([workletCode], { type: 'application/javascript' });
  cachedWorkletUrl = URL.createObjectURL(blob);
  return cachedWorkletUrl;
}

async function createAudioWorklet(audioContext, socket) {
  const workletUrl = getWorkletUrl();
  let promise = workletModulePromises.get(audioContext);
  if (!promise) {
    promise = audioContext.audioWorklet.addModule(workletUrl);
    workletModulePromises.set(audioContext, promise);
  }
  try { await promise; } catch (err) { workletModulePromises.delete(audioContext); throw err; }
  const processor = new AudioWorkletNode(audioContext, 'pcm-processor');
  const pendingQueue = [];
  let socketOpen = socket.readyState === WebSocket.OPEN;
  const flushQueue = () => { while (pendingQueue.length > 0 && socket.readyState === WebSocket.OPEN) socket.send(pendingQueue.shift()); };
  socket.addEventListener('open', () => { socketOpen = true; flushQueue(); });
  socket.addEventListener('close', () => { socketOpen = false; });
  processor.port.onmessage = (event) => {
    const pcm = event.data.pcm;
    if (socket.readyState === WebSocket.OPEN) {
      if (pendingQueue.length) flushQueue();
      try { socket.send(pcm); } catch (_e) { void _e; }
    } else if (!socketOpen) {
      if (pendingQueue.length < 32) pendingQueue.push(pcm);
    }
  };
  return processor;
}

export async function startMicrophoneStt({
  apiKey = DEFAULT_API_KEY,
  onTranscript,
  onOpen,
  onClose,
  onError,
  options = {},
} = {}) {
  if (!apiKey) {
    const err = new Error('Deepgram API key missing. Set VITE_DEEPGRAM_API_KEY.');
    onError?.(err); throw err;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    const err = new Error('Microphone access not supported.');
    onError?.(err); throw err;
  }

  let stream, audioContext, source, processor, silentGain;

  try {
    const socket = createSttSocket({ apiKey, onTranscript, onOpen, onClose, onError, options });

    const streamPromise = navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    const audioContextPromise = (async () => {
      const ctx = new AudioContext({ sampleRate: 16000, latencyHint: 'interactive' });
      if (ctx.state === 'suspended') await ctx.resume();
      return ctx;
    })();

    stream = await streamPromise;
    audioContext = await audioContextPromise;

    source = audioContext.createMediaStreamSource(stream);
    processor = await createAudioWorklet(audioContext, socket);

    silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioContext.destination);

    const keepAlive = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        try { socket.send(JSON.stringify({ type: 'KeepAlive' })); } catch (_e) { void _e; }
      }
    }, 5000);

    return {
      stream, socket,
      stop() {
        clearInterval(keepAlive);
        try {
          if (socket.readyState === WebSocket.OPEN) {
            try { socket.send(JSON.stringify({ type: 'CloseStream' })); } catch (_e) { void _e; }
          }
          processor?.disconnect(); source?.disconnect(); silentGain?.disconnect();
          stream?.getTracks().forEach((t) => t.stop());
          if (socket?.readyState === WebSocket.OPEN) {
            try { socket.close(); } catch (_e) { void _e; }
          } else if (socket?.readyState === WebSocket.CONNECTING) {
            socket.onopen = null; socket.onclose = null; socket.onerror = null; socket.onmessage = null;
          }
          if (audioContext?.state !== 'closed') audioContext.close();
        } catch (_e) { void _e; }
      },
    };
  } catch (err) {
    try { stream?.getTracks().forEach((t) => t.stop()); } catch (_e) { void _e; }
    try { audioContext?.close?.(); } catch (_e2) { void _e2; }
    onError?.(err); throw err;
  }
}

export async function speakText({
  text,
  apiKey = DEFAULT_API_KEY,
  model = 'aura-asteria-en',
  speed = 1,
  expressivity = 0,
} = {}) {
  if (!apiKey) throw new Error('Deepgram API key is missing. Set VITE_DEEPGRAM_API_KEY in the environment.');
  const isFlux = model.startsWith('flux-');
  const baseUrl = isFlux ? DEEPGRAM.ttsUrlV2 : DEEPGRAM.ttsUrl;
  const query = isFlux
    ? `?model=${model}&speed=${speed}&expressivity=${expressivity}`
    : `?model=${model}`;
  const response = await fetch(`${baseUrl}${query}`, {
    method: 'POST',
    headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error(`Deepgram TTS failed: ${await response.text()}`);
  return response.blob();
}

export function playAudioBlob(blob) {
  const audioUrl = URL.createObjectURL(blob);
  const audio = new Audio(audioUrl);
  audio.onended = () => URL.revokeObjectURL(audioUrl);
  audio.onerror = () => URL.revokeObjectURL(audioUrl);
  const p = audio.play();
  if (p && typeof p.catch === 'function') {
    p.catch((err) => {
      console.warn('[TTS] Audio autoplay blocked, unlocking via user gesture:', err?.message);
      URL.revokeObjectURL(audioUrl);
      throw err;
    });
  }
  return audio;
}

export async function speakNodeRedText({
  text,
  apiKey = DEFAULT_API_KEY,
  model = 'aura-asteria-en',
  speed = 1,
  expressivity = 0,
} = {}) {
  if (!text) return null;
  const needsFallback = !apiKey;
  if (needsFallback) {
    console.log('[TTS] No Deepgram key, using browser speechSynthesis');
    return browserSpeakFallback(text);
  }
  try {
    const blob = await speakText({ text, apiKey, model, speed, expressivity });
    try {
      const audio = playAudioBlob(blob);
      return audio;
    } catch (playErr) {
      console.warn('[TTS] play() blocked, fallback to speechSynthesis:', playErr);
      return browserSpeakFallback(text);
    }
  } catch (err) {
    console.warn('[TTS] Deepgram failed, fallback to browser:', err?.message);
    return browserSpeakFallback(text);
  }
}

function browserSpeakFallback(text) {
  if (!('speechSynthesis' in window)) {
    console.error('[TTS] speechSynthesis not supported and Deepgram failed');
    return null;
  }
  try { window.speechSynthesis.cancel(); } catch (_e) { void _e; }
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1; u.pitch = 1; u.volume = 1;
  u.onstart = () => console.log('[TTS] browser fallback started:', text.slice(0, 40));
  u.onerror = (e) => console.error('[TTS] browser fallback error:', e);
  window.speechSynthesis.speak(u);
  return u;
}
