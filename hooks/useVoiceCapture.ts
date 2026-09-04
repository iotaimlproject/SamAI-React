"use client";

import { useEffect, useRef, useState } from "react";
import { startMicrophoneStt, type SttSession } from "@/lib/deepgram";

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}
type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: Array<Array<{ transcript: string }>>; resultIndex: number }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  onspeechend: (() => void) | null;
  onnomatch: (() => void) | null;
};

export function useVoiceCapture({ enabled, onResult }: { enabled: boolean; onResult?: (_transcript: string, _isFinal: boolean) => void }) {
  const [listening, setListening] = useState(false);
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const sessionRef = useRef<SttSession | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onResultRef = useRef(onResult);
  const committedRef = useRef("");
  const interimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [resolvedKey, setResolvedKey] = useState("");

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/deepgram/token")
      .then(async (r) => {
        if (!r.ok) return;
        const d = await r.json() as { access_token?: string; key?: string };
        const tok = d.access_token || d.key || "";
        if (!cancelled && tok) setResolvedKey(tok);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const startBrowserSTT = (activeRef: { current: boolean }) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setText("Mic not supported");
      setListening(false);
      return null;
    }
    try {
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      (rec as unknown as { maxAlternatives: number }).maxAlternatives = 1;
      rec.lang = "en-IN";
      rec.onresult = (e) => {
        if (!activeRef.current) return;
        let interimTxt = "";
        let finalTxt = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (!res) continue;
          const t = res[0]?.transcript ?? "";
          const isFinal = (res as unknown as { isFinal: boolean }).isFinal;
          if (isFinal) finalTxt += t + " ";
          else interimTxt += t + " ";
        }
        if (finalTxt.trim()) {
          const cleaned = finalTxt.trim();
          committedRef.current = committedRef.current ? `${committedRef.current} ${cleaned}` : cleaned;
          if (committedRef.current.length > 500) committedRef.current = committedRef.current.slice(-500);
          setText(committedRef.current);
          setInterim("");
          onResultRef.current?.(cleaned, true);
        }
        if (interimTxt.trim()) {
          if (interimTimerRef.current) clearTimeout(interimTimerRef.current);
          setInterim(interimTxt.trim());
          const preview = committedRef.current ? `${committedRef.current} ${interimTxt.trim()}` : interimTxt.trim();
          setText(preview);
          onResultRef.current?.(interimTxt.trim(), false);
          interimTimerRef.current = setTimeout(() => { if (activeRef.current) setInterim(""); }, 1500);
        }
      };
      rec.onerror = () => {};
      rec.onend = () => {
        if (activeRef.current) {
          try { rec.start(); } catch { setListening(false); }
        }
      };
      recognitionRef.current = rec;
      rec.start();
      setListening(true);
      return rec;
    } catch {
      setListening(false);
      return null;
    }
  };

  useEffect(() => {
    if (!enabled) {
      committedRef.current = "";

      setInterim("");
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      sessionRef.current?.stop();
      sessionRef.current = null;
      try { recognitionRef.current?.abort(); } catch {}
      try { recognitionRef.current?.stop(); } catch {}
      recognitionRef.current = null;
      setListening(false);
      if (interimTimerRef.current) clearTimeout(interimTimerRef.current);
      return;
    }

    setListening(true);
    let active = true;
    const activeRef = { current: true };
    let finalDebounce: ReturnType<typeof setTimeout> | null = null;

    const tryDeepgram = resolvedKey && resolvedKey.length >= 10;
    if (!tryDeepgram) {
      startBrowserSTT(activeRef);
      return () => {
        active = false; activeRef.current = false;
        if (finalDebounce) clearTimeout(finalDebounce);
        if (interimTimerRef.current) clearTimeout(interimTimerRef.current);
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        try { recognitionRef.current?.abort(); } catch {}
        try { recognitionRef.current?.stop(); } catch {}
        recognitionRef.current = null;
        setListening(false);
        setInterim("");
      };
    }

    const connectDeepgram = () => {
      if (!active || !activeRef.current) return;
      startMicrophoneStt({
        apiKey: resolvedKey,
        onOpen: () => {
          if (!active) return;
          setListening(true);
        },
        onTranscript: ({ transcript, isFinal, speechFinal }) => {
          if (!active || !transcript) return;
          const cleaned = transcript.trim();
          if (!cleaned) return;
          if (isFinal || speechFinal) {
            if (finalDebounce) clearTimeout(finalDebounce);
            finalDebounce = setTimeout(() => {
              if (!active) return;
              committedRef.current = committedRef.current ? `${committedRef.current} ${cleaned}` : cleaned;
              if (committedRef.current.length > 500) committedRef.current = committedRef.current.slice(-500);
              setText(committedRef.current);
              setInterim("");
              onResultRef.current?.(cleaned, true);
            }, 60);
          } else {
            if (interimTimerRef.current) clearTimeout(interimTimerRef.current);
            setInterim(cleaned);
            const preview = committedRef.current ? `${committedRef.current} ${cleaned}` : cleaned;
            setText(preview);
            onResultRef.current?.(cleaned, false);
            interimTimerRef.current = setTimeout(() => { if (active) setInterim(""); }, 1500);
          }
        },
        onError: () => {
          if (active && !recognitionRef.current) {
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = setTimeout(() => {
              if (active && activeRef.current) startBrowserSTT(activeRef);
            }, 600);
          }
        },
        onClose: () => {
          if (!active || !activeRef.current) return;
          if (recognitionRef.current) return;
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(() => {
            if (active && activeRef.current && enabled) connectDeepgram();
          }, 500);
        },
      })
        .then((session) => {
          if (!active) { session.stop(); return; }
          sessionRef.current = session;
          setListening(true);
        })
        .catch(() => {
          if (active) startBrowserSTT(activeRef);
        });
    };

    connectDeepgram();

    return () => {
      active = false; activeRef.current = false;
      if (finalDebounce) clearTimeout(finalDebounce);
      if (interimTimerRef.current) clearTimeout(interimTimerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      sessionRef.current?.stop();
      sessionRef.current = null;
      try { recognitionRef.current?.abort(); } catch {}
      try { recognitionRef.current?.stop(); } catch {}
      recognitionRef.current = null;
      setListening(false);
      setInterim("");
    };
  }, [enabled, resolvedKey]);

  return {
    listening,
    text,
    interim,
    isInterim: Boolean(interim),
    setText,
    stop: () => {
      committedRef.current = "";
      setInterim("");
      setListening(false);
      if (interimTimerRef.current) clearTimeout(interimTimerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      sessionRef.current?.stop();
      sessionRef.current = null;
      try { recognitionRef.current?.abort(); } catch {}
      try { recognitionRef.current?.stop(); } catch {}
      recognitionRef.current = null;
    },
  };
}
