"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { speakable } from "@/lib/speech";
import { startWavRecorder, type WavRecorder } from "@/lib/wav";

export type VoiceEngine = "gradium" | "browser" | "none";

function pickBrowserVoice() {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => /en-GB/i.test(v.lang) && /female|libby|sonia|serena|hazel|kate/i.test(v.name)) ??
    voices.find((v) => /Google UK English Female|Samantha|Karen|Moira/i.test(v.name)) ??
    voices.find((v) => v.lang.startsWith("en")) ??
    null
  );
}

/** Speaks coach lines with Gradium TTS, falling back to the browser's speech synthesis. */
export function useSpeaker(gradium: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tokenRef = useRef(0);
  const gradiumOk = useRef(true);
  const gradiumFailures = useRef(0);
  const pausedRef = useRef(false);
  const cutForPause = useRef(false);
  const resumeUtterance = useRef<(() => void) | null>(null);
  const resumeWaiters = useRef<Array<() => void>>([]);
  const [speaking, setSpeaking] = useState(false);
  const [engine, setEngine] = useState<VoiceEngine | null>(null);

  const whenRunning = useCallback(() => {
    if (!pausedRef.current) return Promise.resolve();
    return new Promise<void>((resolve) => resumeWaiters.current.push(resolve));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.getVoices();
    const onChange = () => window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener("voiceschanged", onChange);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", onChange);
  }, []);

  const releaseWaiters = useCallback(() => {
    const waiters = resumeWaiters.current;
    resumeWaiters.current = [];
    for (const resume of waiters) resume();
  }, []);

  const stop = useCallback(() => {
    tokenRef.current++;
    cutForPause.current = false;
    resumeUtterance.current = null;
    releaseWaiters();
    const a = audioRef.current;
    audioRef.current = null;
    if (a) {
      a.pause();
      a.dispatchEvent(new Event("ended"));
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [releaseWaiters]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    const audio = audioRef.current;
    if (audio && !audio.paused && !audio.ended) audio.pause();
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (synth?.speaking) {
      // Chrome keeps playing through speechSynthesis.pause(), so cut the utterance and restart the rest later.
      cutForPause.current = true;
      synth.cancel();
    }
  }, []);

  const resume = useCallback(() => {
    const wasPaused = pausedRef.current;
    pausedRef.current = false;
    const audio = audioRef.current;
    if (wasPaused && audio && audio.paused && !audio.ended) void audio.play().catch(() => undefined);
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    synth?.resume();
    const continueUtterance = resumeUtterance.current;
    resumeUtterance.current = null;
    if (continueUtterance) setTimeout(continueUtterance, 60);
    releaseWaiters();
  }, [releaseWaiters]);

  useEffect(() => stop, [stop]);

  const speakBrowser = useCallback((text: string, token: number) => {
    const spoken = speakable(text);
    return new Promise<VoiceEngine>((resolve) => {
      if (!("speechSynthesis" in window) || window.speechSynthesis.getVoices().length === 0) return resolve("none");
      let offset = 0;
      let safety = 0;
      let settled = false;
      const finish = (engine: VoiceEngine) => {
        if (settled) return;
        settled = true;
        clearTimeout(safety);
        resolve(engine);
      };
      const say = () => {
        if (token !== tokenRef.current) return finish("none");
        const from = offset;
        const slice = spoken.slice(from).trim();
        if (!slice) return finish(from > 0 ? "browser" : "none");
        const u = new SpeechSynthesisUtterance(slice);
        const v = pickBrowserVoice();
        if (v) u.voice = v;
        u.rate = 1.04;
        u.pitch = 1.12;
        const words = slice.split(/\s+/).length;
        clearTimeout(safety);
        safety = window.setTimeout(() => finish(token === tokenRef.current ? "browser" : "none"), words * 480 + 2500);
        u.onboundary = (e) => {
          if (typeof e.charIndex === "number" && e.charIndex > 0) offset = from + e.charIndex;
        };
        const parked = () => {
          clearTimeout(safety);
          resumeUtterance.current = () => {
            if (token !== tokenRef.current) return finish("none");
            say();
          };
        };
        u.onend = () => {
          if (token !== tokenRef.current) return finish("none");
          if (cutForPause.current) {
            cutForPause.current = false;
            parked();
            return;
          }
          finish("browser");
        };
        u.onerror = () => {
          if (token !== tokenRef.current) return finish("none");
          if (cutForPause.current) {
            cutForPause.current = false;
            parked();
            return;
          }
          finish("browser");
        };
        window.speechSynthesis.speak(u);
      };
      void whenRunning().then(say);
    });
  }, [whenRunning]);

  const speak = useCallback(
    async (text: string): Promise<VoiceEngine> => {
      stop();
      const token = ++tokenRef.current;
      setSpeaking(true);
      try {
        if (gradium && gradiumOk.current) {
          const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          }).catch(() => null);
          if (token !== tokenRef.current) return "none";
          if (res?.ok && (res.headers.get("content-type") ?? "").includes("audio")) {
            const url = URL.createObjectURL(await res.blob());
            if (token !== tokenRef.current) {
              URL.revokeObjectURL(url);
              return "none";
            }
            const audio = new Audio(url);
            audioRef.current = audio;
            const ended = new Promise<void>((resolve) => {
              audio.addEventListener("ended", () => resolve(), { once: true });
              audio.addEventListener("error", () => resolve(), { once: true });
            });
            try {
              await whenRunning();
              if (token !== tokenRef.current) {
                URL.revokeObjectURL(url);
                return "none";
              }
              if (!pausedRef.current) await audio.play();
              gradiumFailures.current = 0;
              setEngine("gradium");
              await ended;
              return "gradium";
            } catch {
              // Autoplay blocked or decode failure: fall through to the browser voice.
            } finally {
              URL.revokeObjectURL(url);
            }
          } else if (res && res.status === 501) {
            gradiumOk.current = false;
          } else if (++gradiumFailures.current >= 2) {
            gradiumOk.current = false;
            const reason = await res
              ?.json()
              .then((j: { reason?: string }) => j.reason)
              .catch(() => undefined);
            toast.warning("Gradium voice is unavailable, so Marmo switched to the browser voice.", { description: reason });
          }
        }
        if (token !== tokenRef.current) return "none";
        await whenRunning();
        if (token !== tokenRef.current) return "none";
        const used = await speakBrowser(text, token);
        if (used === "browser") setEngine("browser");
        return used;
      } finally {
        if (token === tokenRef.current) setSpeaking(false);
      }
    },
    [gradium, speakBrowser, stop, whenRunning],
  );

  return { speak, stop, pause, resume, speaking, engine };
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function browserRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type ListenState = "idle" | "recording" | "transcribing";

const noopSubscribe = () => () => {};

/** Push-to-talk: Gradium STT from a WAV recording, or the browser's speech recognition. */
export function useListener(gradium: boolean, onText: (text: string) => void) {
  const [state, setState] = useState<ListenState>("idle");
  const recRef = useRef<WavRecorder | null>(null);
  const srRef = useRef<SpeechRecognitionLike | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gradiumOk = useRef(true);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  const hasRecognition = useSyncExternalStore(
    noopSubscribe,
    () => browserRecognition() !== null,
    () => false,
  );
  const available = gradium || hasRecognition;

  const stop = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (srRef.current) {
      srRef.current.stop();
      return;
    }
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    setState("transcribing");
    try {
      const wav = await rec.stop();
      const res = await fetch("/api/stt", { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav });
      const body = (await res.json().catch(() => ({}))) as { text?: string; fallback?: boolean };
      if (res.ok && body.text?.trim()) onTextRef.current(body.text.trim());
      else if (body.fallback) {
        gradiumOk.current = false;
        toast.warning("Gradium speech-to-text is unavailable. Trying browser recognition next time.");
      } else toast.info("Marmo didn't catch that. Try again or type your question.");
    } catch {
      toast.error("Couldn't transcribe the recording.");
    } finally {
      setState("idle");
    }
  }, []);

  const start = useCallback(async () => {
    if (state !== "idle") return;
    const SR = browserRecognition();
    if (gradium && gradiumOk.current) {
      try {
        recRef.current = await startWavRecorder();
        setState("recording");
        timerRef.current = setTimeout(() => void stop(), 12000);
        return;
      } catch {
        toast.error("Microphone permission is needed for voice questions.");
        return;
      }
    }
    if (SR) {
      const sr = new SR();
      sr.lang = "en-US";
      sr.interimResults = false;
      sr.maxAlternatives = 1;
      sr.onresult = (e) => {
        const text = e.results[0]?.[0]?.transcript?.trim();
        if (text) onTextRef.current(text);
      };
      sr.onerror = (e) => {
        if (e.error !== "no-speech" && e.error !== "aborted") toast.error(`Speech recognition error: ${e.error}`);
      };
      sr.onend = () => {
        srRef.current = null;
        setState("idle");
      };
      srRef.current = sr;
      sr.start();
      setState("recording");
      timerRef.current = setTimeout(() => sr.stop(), 12000);
      return;
    }
    toast.info("Voice input needs a Gradium key or a Chromium browser. Type your question instead.");
  }, [gradium, state, stop]);

  const toggle = useCallback(() => {
    if (state === "recording") void stop();
    else if (state === "idle") void start();
  }, [start, state, stop]);

  return { state, toggle, available };
}
