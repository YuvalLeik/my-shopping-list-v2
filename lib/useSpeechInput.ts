'use client';

import { useEffect, useRef, useState } from 'react';

/** Minimal shape of the browser's (webkit)SpeechRecognition we use. */
interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Hebrew voice input with the browser's built-in speech recognition (free,
 * Android Chrome and iPhone Safari). Calls onText with the final transcript.
 */
export function useSpeechInput(onText: (text: string) => void) {
  // Only used in panels opened after load, so there's no server render to mismatch.
  const [supported] = useState(() => !!getCtor());
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);

  useEffect(() => { onTextRef.current = onText; }, [onText]);

  const start = () => {
    const Ctor = getCtor();
    if (!Ctor || listening) return;
    const rec = new Ctor();
    rec.lang = 'he-IL';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0]?.transcript ?? '').join(' ').trim();
      if (text) onTextRef.current(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  };

  const stop = () => recRef.current?.stop();

  return { supported, listening, start, stop };
}
