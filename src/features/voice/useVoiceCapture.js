import { useEffect, useRef, useState } from 'react';
import { startMicrophoneStt } from '../../services/deepgram';

export function useVoiceCapture({ enabled, onResult }) {
  const [listening, setListening] = useState(false);
  const [text, setText] = useState('');
  const [interim, setInterim] = useState('');
  const sessionRef = useRef(null);
  const onResultRef = useRef(onResult);
  const committedRef = useRef('');
  const interimTimerRef = useRef(null);
  const apiKey = import.meta.env.VITE_DEEPGRAM_API_KEY;

  useEffect(() => { onResultRef.current = onResult; }, [onResult]);

  useEffect(() => {
    if (!enabled) {
      committedRef.current = '';
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional sync reset when mic disabled
      setInterim('');
      sessionRef.current?.stop();
      sessionRef.current = null;
      setListening(false);
      if (interimTimerRef.current) clearTimeout(interimTimerRef.current);
      return;
    }

    if (!apiKey) {
      setText('❌ API key missing!');
      setListening(false);
      return;
    }

    let active = true;
    let finalDebounce = null;

    startMicrophoneStt({
      apiKey,
      onOpen: () => {
        if (!active) return;
        committedRef.current = '';
        setListening(true);
        setText('');
        setInterim('');
      },
      onTranscript: ({ transcript, isFinal, speechFinal }) => {
        if (!active || !transcript) return;

        const cleaned = transcript.trim();
        if (!cleaned) return;

        if (isFinal || speechFinal) {
          if (finalDebounce) clearTimeout(finalDebounce);
          finalDebounce = setTimeout(() => {
            if (!active) return;
            const finalText = cleaned;
            committedRef.current = committedRef.current
              ? `${committedRef.current} ${finalText}`
              : finalText;
            setText(committedRef.current);
            setInterim('');
            onResultRef.current?.(finalText, true);
          }, 80);
        } else {
          if (interimTimerRef.current) clearTimeout(interimTimerRef.current);
          setInterim(cleaned);
          const preview = committedRef.current
            ? `${committedRef.current} ${cleaned}`
            : cleaned;
          setText(preview);
          onResultRef.current?.(cleaned, false);
          interimTimerRef.current = setTimeout(() => {
            if (active) setInterim('');
          }, 1200);
        }
      },
      onError: (err) => {
        if (active) setText(`❌ ${err.message || 'STT error'}`);
      },
      onClose: () => {
        if (active) setListening(false);
      },
    })
      .then((session) => {
        if (!active) { session.stop(); return; }
        sessionRef.current = session;
      })
      .catch((err) => {
        if (active) setText(`❌ Mic failed: ${err.message}`);
      });

    return () => {
      active = false;
      if (finalDebounce) clearTimeout(finalDebounce);
      if (interimTimerRef.current) clearTimeout(interimTimerRef.current);
      sessionRef.current?.stop();
      sessionRef.current = null;
      setListening(false);
      setInterim('');
    };
  }, [enabled, apiKey]);

  return {
    listening,
    text,
    interim,
    isInterim: Boolean(interim),
    setText,
    stop: () => {
      committedRef.current = '';
      setInterim('');
      sessionRef.current?.stop();
    },
  };
}
