const DEFAULT_API_KEY = "";

export const DEEPGRAM = {
  sttUrl: "wss://api.deepgram.com/v1/listen",
  ttsUrl: "https://api.deepgram.com/v1/speak",
  ttsUrlV2: "https://api.deepgram.com/v2/speak",
} as const;

const isDev = process.env.NODE_ENV !== "production";
const log = (...a: unknown[]) => {
  if (isDev) console.log(...a);
};

export function makeSttUrl(options: Record<string, string> = {}): string {
  const params = new URLSearchParams({
    model: "nova-3",
    language: "en-IN",
    encoding: "linear16",
    sample_rate: "16000",
    channels: "1",
    interim_results: "true",
    punctuate: "true",
    smart_format: "true",
    endpointing: "500",
    utterance_end_ms: "2500",
    vad_events: "true",
    ...options,
  });
  return `${DEEPGRAM.sttUrl}?${params.toString()}`;
}

type TranscriptPayload = {
  transcript: string;
  isFinal: boolean;
  speechFinal: boolean;
  payload: unknown;
};

export function createSttSocket({
  apiKey = DEFAULT_API_KEY,
  onTranscript,
  onOpen,
  onClose,
  onError,
  options = {},
}: {
  apiKey?: string;
  onTranscript?: (_p: TranscriptPayload) => void;
  onOpen?: () => void;
  onClose?: (_e: CloseEvent) => void;
  onError?: (_e: unknown) => void;
  options?: Record<string, string>;
} = {}): WebSocket {
  if (!apiKey || !apiKey.trim()) {
    const err = new Error("Deepgram API key missing. Set DEEPGRAM_API_KEY in .env and restart (pnpm dev).");
    console.error("[Deepgram]", err.message);
    throw err;
  }
  if (apiKey.length < 20) console.warn("[Deepgram] API key looks too short – check DEEPGRAM_API_KEY");
  const isJwt = apiKey.split(".").length === 3;

  let url = makeSttUrl(options);
  let socket: WebSocket;
  if (isJwt) {
    const sep = url.includes("?") ? "&" : "?";
    url = `${url}${sep}access_token=${encodeURIComponent(apiKey)}`;
    log("[Deepgram STT] Connecting with JWT via access_token:", url.replace(/access_token=[^&]+/, "access_token=***"));
    socket = new WebSocket(url);
  } else {
    log("[Deepgram STT] Connecting to:", url);
    socket = new WebSocket(url, ["token", apiKey]);
  }
  socket.binaryType = "arraybuffer";

  socket.onopen = () => {
    log("[Deepgram STT] Socket opened!");
    onOpen?.();
  };

  socket.onmessage = (event: MessageEvent) => {
    const message = typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);
    try {
      const payload = JSON.parse(message) as Record<string, unknown>;
      if (payload.type === "Results") {
        const alt = (payload.channel as { alternatives?: Array<{ transcript?: string }> })?.alternatives?.[0];
        const transcript = alt?.transcript ?? "";
        const isFinal = Boolean(payload.is_final);
        const speechFinal = Boolean(payload.speech_final);
        if (transcript) onTranscript?.({ transcript, isFinal, speechFinal, payload });
      } else if (payload.type === "Metadata") {
        log("[Deepgram] Metadata:", payload);
      }
    } catch (e) {
      onError?.(e);
    }
  };

  socket.onerror = (event: Event) => {
    console.error("[Deepgram STT] Socket error (likely 401 auth or invalid params). Check DEEPGRAM_API_KEY. Verify network allows wss://api.deepgram.com. Event:", event);
    onError?.(event);
  };

  socket.onclose = (event: CloseEvent) => {
    log(`[Deepgram STT] Socket closed code=${event.code} reason="${event.reason}" wasClean=${event.wasClean}`);
    if (event.code === 1006) console.error("[Deepgram] Abnormal closure 1006: usually 401 invalid API key, invalid query params, or firewall/proxy blocking wss. Try minimal URL: wss://api.deepgram.com/v1/listen?model=nova-3&language=en-IN&encoding=linear16&sample_rate=16000&interim_results=true");
    if (event.code === 1008) console.error("[Deepgram] Policy violation 1008: rate limit or payload too large");
    onClose?.(event);
  };

  return socket;
}

let cachedWorkletUrl: string | null = null;
const workletModulePromises = new WeakMap<AudioContext, Promise<void>>();

function getWorkletUrl(): string {
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
  const blob = new Blob([workletCode], { type: "application/javascript" });
  cachedWorkletUrl = URL.createObjectURL(blob);
  return cachedWorkletUrl;
}

async function createAudioWorklet(audioContext: AudioContext, socket: WebSocket): Promise<AudioWorkletNode> {
  const workletUrl = getWorkletUrl();
  let promise = workletModulePromises.get(audioContext);
  if (!promise) {
    promise = audioContext.audioWorklet.addModule(workletUrl);
    workletModulePromises.set(audioContext, promise);
  }
  try {
    await promise;
  } catch (err) {
    workletModulePromises.delete(audioContext);
    throw err;
  }
  const processor = new AudioWorkletNode(audioContext, "pcm-processor");
  const pendingQueue: ArrayBuffer[] = [];
  let socketOpen = socket.readyState === WebSocket.OPEN;
  const flushQueue = () => {
    while (pendingQueue.length > 0 && socket.readyState === WebSocket.OPEN) socket.send(pendingQueue.shift()!);
  };
  socket.addEventListener("open", () => {
    socketOpen = true;
    flushQueue();
  });
  socket.addEventListener("close", () => {
    socketOpen = false;
  });
  processor.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer }>) => {
    const pcm = event.data.pcm;
    if (socket.readyState === WebSocket.OPEN) {
      if (pendingQueue.length) flushQueue();
      try {
        socket.send(pcm);
      } catch {
        void 0;
      }
    } else if (!socketOpen) {
      if (pendingQueue.length < 32) pendingQueue.push(pcm);
    }
  };
  return processor;
}

export type SttSession = {
  stream: MediaStream;
  socket: WebSocket;
  stop: () => void;
};

export async function startMicrophoneStt({
  apiKey = DEFAULT_API_KEY,
  onTranscript,
  onOpen,
  onClose,
  onError,
  options = {},
}: {
  apiKey?: string;
  onTranscript?: (_p: TranscriptPayload) => void;
  onOpen?: () => void;
  onClose?: (_e: CloseEvent) => void;
  onError?: (_e: unknown) => void;
  options?: Record<string, string>;
} = {}): Promise<SttSession> {
  if (!apiKey) {
    const err = new Error("Deepgram API key missing. Set DEEPGRAM_API_KEY in .env.");
    onError?.(err);
    throw err;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    const err = new Error("Microphone access not supported.");
    onError?.(err);
    throw err;
  }

  let stream: MediaStream | undefined;
  let audioContext: AudioContext | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let processor: AudioWorkletNode | undefined;
  let silentGain: GainNode | undefined;

  try {
    const socket = createSttSocket({ apiKey, onTranscript, onOpen, onClose, onError, options });

    const streamPromise = navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    const audioContextPromise = (async () => {
      const ctx = new AudioContext({ sampleRate: 16000, latencyHint: "interactive" });
      if (ctx.state === "suspended") await ctx.resume();
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
        try {
          socket.send(JSON.stringify({ type: "KeepAlive" }));
        } catch {
          void 0;
        }
      }
    }, 5000);

    return {
      stream,
      socket,
      stop() {
        clearInterval(keepAlive);
        try {
          if (socket.readyState === WebSocket.OPEN) {
            try {
              socket.send(JSON.stringify({ type: "CloseStream" }));
            } catch {
              void 0;
            }
          }
          processor?.disconnect();
          source?.disconnect();
          silentGain?.disconnect();
          stream?.getTracks().forEach((t) => t.stop());
          if (socket?.readyState === WebSocket.OPEN) {
            try {
              socket.close();
            } catch {
              void 0;
            }
          } else if (socket?.readyState === WebSocket.CONNECTING) {
            socket.onopen = null;
            socket.onclose = null;
            socket.onerror = null;
            socket.onmessage = null;
          }
          if (audioContext && audioContext.state !== "closed") void audioContext.close();
        } catch {
          void 0;
        }
      },
    };
  } catch (err) {
    try {
      stream?.getTracks().forEach((t) => t.stop());
    } catch {
      void 0;
    }
    try {
      await audioContext?.close();
    } catch {
      void 0;
    }
    onError?.(err);
    throw err;
  }
}

export async function speakText({
  text,
  apiKey = DEFAULT_API_KEY,
  model = "aura-asteria-en",
  speed = 1,
  expressivity = 0,
}: {
  text: string;
  apiKey?: string;
  model?: string;
  speed?: number;
  expressivity?: number;
}): Promise<Blob> {

  const useProxy = !apiKey || apiKey === DEFAULT_API_KEY;
  if (useProxy && typeof window !== "undefined") {
    const res = await fetch("/api/deepgram/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, model, speed, expressivity }),
    });
    if (!res.ok) throw new Error(`Deepgram TTS proxy failed: ${await res.text()}`);
    return res.blob();
  }
  if (!apiKey) throw new Error("Deepgram API key is missing. Set DEEPGRAM_API_KEY in .env.");
  const isFlux = model.startsWith("flux-");
  const baseUrl = isFlux ? DEEPGRAM.ttsUrlV2 : DEEPGRAM.ttsUrl;
  const query = isFlux ? `?model=${model}&speed=${speed}&expressivity=${expressivity}` : `?model=${model}`;
  const response = await fetch(`${baseUrl}${query}`, {
    method: "POST",
    headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error(`Deepgram TTS failed: ${await response.text()}`);
  return response.blob();
}

export function playAudioBlob(blob: Blob): HTMLAudioElement {
  const audioUrl = URL.createObjectURL(blob);
  const audio = new Audio(audioUrl);
  audio.onended = () => URL.revokeObjectURL(audioUrl);
  audio.onerror = () => URL.revokeObjectURL(audioUrl);
  const p = audio.play();
  if (p && typeof p.catch === "function") {
    p.catch((err: Error) => {
      console.warn("[TTS] Audio autoplay blocked, unlocking via user gesture:", err?.message);
      URL.revokeObjectURL(audioUrl);
      throw err;
    });
  }
  return audio;
}

export async function speakNodeRedText({
  text,
  apiKey = DEFAULT_API_KEY,
  model = "aura-asteria-en",
  speed = 1,
  expressivity = 0,
}: {
  text: string;
  apiKey?: string;
  model?: string;
  speed?: number;
  expressivity?: number;
}): Promise<HTMLAudioElement | SpeechSynthesisUtterance | null> {
  if (!text) return null;

  try {
    const blob = await speakText({ text, apiKey, model, speed, expressivity });
    try {
      const audio = playAudioBlob(blob);
      return audio;
    } catch (playErr) {
      console.warn("[TTS] play() blocked, fallback to speechSynthesis:", playErr);
      return browserSpeakFallback(text);
    }
  } catch (err) {
    console.warn("[TTS] Deepgram failed, fallback to browser:", (err as Error)?.message);
    return browserSpeakFallback(text);
  }
}

function browserSpeakFallback(text: string): SpeechSynthesisUtterance | null {
  if (!("speechSynthesis" in window)) {
    console.error("[TTS] speechSynthesis not supported and Deepgram failed");
    return null;
  }
  try {
    window.speechSynthesis.cancel();
  } catch {
    void 0;
  }
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1;
  u.pitch = 1;
  u.volume = 1;
  u.onstart = () => console.log("[TTS] browser fallback started:", text.slice(0, 40));
  u.onerror = (e) => console.error("[TTS] browser fallback error:", e);
  window.speechSynthesis.speak(u);
  return u;
}
