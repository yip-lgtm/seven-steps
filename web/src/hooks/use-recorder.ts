import { useCallback, useEffect, useRef, useState } from "react";

function pickMime(): string | undefined {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const t of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return undefined;
}

export function useRecorder(
  onDenied: () => void,
  onComplete: (url: string, secs: number) => void,
) {
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const stopTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state === "recording") rec.stop();
    stopTimer();
    setRecording(false);
  }, []);

  const start = useCallback(async () => {
    if (recRef.current?.state === "recording") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mime = pickMime();
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      recRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const chunks = chunksRef.current;
        chunksRef.current = [];
        if (!chunks.length) return;
        const blob = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" });
        const secs = Math.max(
          1,
          Math.floor((Date.now() - startedRef.current) / 1000),
        );
        completeRef.current(URL.createObjectURL(blob), secs);
      };
      rec.start();
      startedRef.current = Date.now();
      setElapsed(0);
      setRecording(true);
      stopTimer();
      timerRef.current = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedRef.current) / 1000));
      }, 200);
    } catch {
      onDenied();
    }
  }, [onDenied]);

  useEffect(() => () => stop(), [stop]);

  return { recording, elapsed, start, stop };
}
