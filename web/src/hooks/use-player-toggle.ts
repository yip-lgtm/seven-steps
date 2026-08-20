import { useCallback, useEffect, useRef, useState } from "react";
import { playClipText, prefetchSpeech, stopPlayback } from "@/lib/player";
import { useApp } from "@/lib/store";

export function usePlayerToggle() {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const settings = useApp((s) => s.settings);

  const stop = useCallback(() => {
    stopPlayback();
    setPlaying(false);
    setLoading(false);
    busy.current = false;
  }, []);

  const toggle = useCallback(
    async (text: string, fileUrl?: string | null) => {
      if (busy.current || playing || loading) {
        stop();
        return;
      }
      busy.current = true;
      setLoading(true);
      try {
        await playClipText(text, {
          preferNatural: settings.preferNaturalVoice,
          rate: settings.rate,
          pitch: settings.pitch,
          voice: settings.voice,
          fileUrl,
          onReady: () => {
            setLoading(false);
            setPlaying(true);
          },
        });
      } finally {
        setPlaying(false);
        setLoading(false);
        busy.current = false;
      }
    },
    [playing, loading, settings, stop],
  );

  const prefetch = useCallback(
    (text: string) => {
      void prefetchSpeech(text, settings.preferNaturalVoice);
    },
    [settings.preferNaturalVoice],
  );

  useEffect(() => () => stopPlayback(), []);

  return { playing, loading, toggle, stop, prefetch };
}
