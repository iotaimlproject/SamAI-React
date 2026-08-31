import { useEffect, useRef, useState } from 'react';
import { startMicrophoneStt } from '../../services/deepgram';
import { sendVoiceToNodeRed } from './voiceService';

export function useVoiceCapture({ enabled, onResult }) {
  const [listening, setListening] = useState(false);
  const [text, setText] = useState('');
  const sessionRef = useRef(null);
  const apiKey = import.meta.env.VITE_DEEPGRAM_API_KEY;

  useEffect(() => {
    console.log('[useVoiceCapture] Effect triggered. enabled:', enabled, 'apiKey exists:', !!apiKey);

    if (!enabled) {
      console.log('[useVoiceCapture] Disabled, stopping session');
      sessionRef.current?.stop();
      sessionRef.current = null;
      setListening(false);
      return;
    }

    if (!apiKey) {
      console.error('[useVoiceCapture] API KEY MISSING! Set VITE_DEEPGRAM_API_KEY in .env');
      setText('❌ API key missing!');
      setListening(false);
      return;
    }

    console.log('[useVoiceCapture] Starting STT initialization...');
    let active = true;

    startMicrophoneStt({
      apiKey,
      onOpen: () => {
        console.log('[useVoiceCapture.onOpen] STT socket opened!');
        if (active) {
          setListening(true);
          setText('');
        }
      },
      onTranscript: ({ transcript, isFinal }) => {
        console.log('[useVoiceCapture.onTranscript] Received:', transcript, 'isFinal:', isFinal);
        if (!active) return;
        setText(transcript);
        onResult?.(transcript, isFinal);

        if (isFinal) {
          console.log('[useVoiceCapture] Final transcript sent to Node-RED');
          sendVoiceToNodeRed(transcript);
        }
      },
      onError: (err) => {
        console.error('[useVoiceCapture.onError] STT error:', err);
        if (active) {
          setText('❌ STT error');
        }
      },
      onClose: () => {
        console.log('[useVoiceCapture.onClose] STT socket closed');
        if (active) setListening(false);
      },
    })
      .then((session) => {
        console.log('[useVoiceCapture] Session started successfully');
        if (!active) {
          console.log('[useVoiceCapture] Component unmounted, stopping session');
          session.stop();
          return;
        }
        sessionRef.current = session;
      })
      .catch((err) => {
        console.error('[useVoiceCapture] CRITICAL - STT initialization failed:', err, err.stack);
        if (active) {
          setText('❌ Mic failed: ' + err.message);
        }
      });

    return () => {
      console.log('[useVoiceCapture] Cleanup - stopping session');
      active = false;
      sessionRef.current?.stop();
      sessionRef.current = null;
      setListening(false);
    };
  }, [enabled, apiKey, onResult]);

  return { listening, text, setText, stop: () => sessionRef.current?.stop() };
}
