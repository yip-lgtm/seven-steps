import { synthesizeSpeech } from "@/lib/server/tts";
import { hashText } from "./utils";

const urlCache = new Map<string, string>();
let naturalOk: boolean | null = null;
let currentAudio: HTMLAudioElement | null = null;
let speaking = false;
let playToken = 0;

export function isSpeaking(): boolean {
  return speaking;
}

export function stopPlayback(): void {
  playToken += 1;
  speaking = false;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function playUrl(url: string): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    currentAudio = audio;
    const done = () => {
      audio.onended = null;
      audio.onerror = null;
      if (currentAudio === audio) currentAudio = null;
      resolve();
    };
    audio.onended = done;
    audio.onerror = done;
    audio.play().catch(done);
  });
}

function loadVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  return speechSynthesis.getVoices().filter((v) =>
    v.lang.toLowerCase().startsWith("en"),
  );
}

let prewarmed = false;
function prewarm(): void {
  if (prewarmed || typeof window === "undefined") return;
  prewarmed = true;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}

export function listEnglishVoices(): SpeechSynthesisVoice[] {
  return loadVoices();
}

export function browserSpeak(
  text: string,
  opts: { rate: number; pitch: number; voice: string },
): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve();
      return;
    }
    prewarm();
    speechSynthesis.cancel();
    if (speechSynthesis.paused) {
      try {
        speechSynthesis.resume();
      } catch {
        /* ignore */
      }
    }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = opts.rate;
    u.pitch = opts.pitch;
    u.lang = "en-US";
    const voices = loadVoices();
    if (opts.voice) {
      const v = voices.find((x) => x.voiceURI === opts.voice || x.name === opts.voice);
      if (v) u.voice = v;
    } else {
      const preferred =
        voices.find(
          (v) =>
            v.lang === "en-US" &&
            /samantha|natural|google|enhanced|premium/i.test(v.name),
        ) ||
        voices.find((v) => v.lang === "en-US") ||
        voices[0];
      if (preferred) u.voice = preferred;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    u.onend = finish;
    u.onerror = finish;
    const words = text.split(/\s+/).length;
    const ms = Math.max(3000, (words / Math.max(0.5, u.rate)) * (60000 / 150) + 2500);
    setTimeout(finish, ms);
    try {
      speechSynthesis.speak(u);
    } catch {
      finish();
    }
  });
}

export async function prefetchSpeech(
  text: string,
  preferNatural: boolean,
): Promise<void> {
  if (!preferNatural || naturalOk === false || !text.trim()) return;
  const key = hashText(text);
  if (urlCache.has(key)) return;
  const res = await synthesizeSpeech({ data: { text } });
  if (res.ok) {
    urlCache.set(key, `data:${res.mime};base64,${res.audio}`);
    naturalOk = true;
  } else {
    naturalOk = false;
  }
}

export async function playClipText(
  text: string,
  opts: {
    preferNatural: boolean;
    rate: number;
    pitch: number;
    voice: string;
    fileUrl?: string | null;
    onReady?: () => void;
  },
): Promise<"natural" | "device" | "file"> {
  stopPlayback();
  const my = playToken;
  speaking = true;
  try {
    if (opts.fileUrl) {
      if (my !== playToken) return "file";
      opts.onReady?.();
      await playUrl(opts.fileUrl);
      return "file";
    }
    if (opts.preferNatural && naturalOk !== false) {
      const key = hashText(text);
      let url = urlCache.get(key);
      if (!url) {
        const res = await synthesizeSpeech({ data: { text } });
        if (my !== playToken) return "natural";
        if (res.ok) {
          url = `data:${res.mime};base64,${res.audio}`;
          urlCache.set(key, url);
          naturalOk = true;
        } else {
          naturalOk = false;
        }
      }
      if (url) {
        if (my !== playToken) return "natural";
        opts.onReady?.();
        await playUrl(url);
        return "natural";
      }
    }
    if (my !== playToken) return "device";
    opts.onReady?.();
    await browserSpeak(text, opts);
    return "device";
  } finally {
    if (my === playToken) speaking = false;
  }
}
