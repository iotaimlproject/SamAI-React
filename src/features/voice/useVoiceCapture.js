import { useEffect, useRef, useState } from 'react';
import { startMicrophoneStt } from '../../services/deepgram';
import { sendVoiceToNodeRed } from './voiceService';

export function useVoiceCapture({ enabled, onResult }) {
  const [listening, setListening] = useState(false);
  const [text, setText] = useState('');
  const sessionRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      sessionRef.current?.stop();
      sessionRef.current = null;
      setListening(false);
      return;
    }

    let active = true;

    startMicrophoneStt({
      apiKey: import.meta.env.VITE_DEEPGRAM_API_KEY,
      onOpen: () => {
        if (active) setListening(true);
      },
      onTranscript: ({ transcript, isFinal }) => {
        if (!active) return;
        setText(transcript);
        onResult?.(transcript, isFinal);

        if (isFinal) {
          sendVoiceToNodeRed(transcript);
        }
      },
      onError: () => {
        if (active) {
          setText('Mic error. Please try again.');
        }
      },
      onClose: () => {
        if (active) setListening(false);
      },
    })
      .then((session) => {
        if (!active) {
          session.stop();
          return;
        }
        sessionRef.current = session;
      })
      .catch(() => {
        setText('Mic access failed.');
      });

    return () => {
      active = false;
      sessionRef.current?.stop();
      sessionRef.current = null;
      setListening(false);
    };
  }, [enabled, onResult]);

  return { listening, text, setText, stop: () => sessionRef.current?.stop() };
}
