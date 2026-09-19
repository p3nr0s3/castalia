"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Microphone as Mic, MicrophoneSlash as MicOff, PhoneDisconnect as PhoneOff, SpeakerHigh as Volume2, SpeakerX as VolumeX, Sparkle as Sparkles, ArrowsClockwise as RefreshCw, Globe, SlidersHorizontal as Settings2, X, ChatText as MessageSquare, Robot as Bot, User, Lightning as Zap } from "@phosphor-icons/react";
import {
  VOICE_PRESETS,
  VoicePreset,
  VoicePresetId,
  VoiceConfig,
  speakUniversal,
  stopSpeaking,
  resolveVoiceForConfig,
  getAllSystemVoices,
} from "@/lib/voiceEngine";
import { OllamaModel, ApiKeysConfig, VoiceSettingsConfig } from "@/lib/types";
import { apiFetch } from "@/lib/apiClient";

interface VoiceModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedModel: string;
  models: OllamaModel[];
  apiKeys?: ApiKeysConfig;
  systemPrompt?: string;
  voiceSettings?: VoiceSettingsConfig;
  onOpenSettings?: () => void;
  onTranscriptMessage?: (role: "user" | "assistant", text: string) => void;
  onSendMessage?: (text: string, tone?: string) => Promise<string>;
}

export const VoiceModeModal: React.FC<VoiceModeModalProps> = ({
  isOpen,
  onClose,
  selectedModel,
  models,
  apiKeys,
  systemPrompt = "Jawablah dengan ramah, komunikatif, alami, dan ringkas dalam 1-3 kalimat saja karena ini percakapan suara langsung.",
  voiceSettings,
  onOpenSettings,
  onTranscriptMessage,
  onSendMessage,
}) => {
  // Call States
  const [status, setStatus] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [lang, setLang] = useState<"id-ID" | "en-US">("id-ID");

  // Effective voice configuration (from Settings)
  const activeVoice: VoiceSettingsConfig = voiceSettings || {
    presetId: "female_gadis",
    pitch: 1.05,
    rate: 1.05,
    tone: "casual",
    engine: "natural",
    autoSilenceMs: 1400,
  };

  // Active voice preset
  const currentPreset =
    VOICE_PRESETS.find((p) => p.id === activeVoice.presetId) || VOICE_PRESETS[0];

  // Transcript logs during call
  const [userTranscript, setUserTranscript] = useState<string>("");
  const [interimTranscript, setInterimTranscript] = useState<string>("");
  const [aiTranscript, setAiTranscript] = useState<string>("");
  const [callHistory, setCallHistory] = useState<{ role: "user" | "assistant"; text: string; id: string }[]>([]);

  // Audio visualization
  const [micLevel, setMicLevel] = useState<number>(0);
  const [aiLevel, setAiLevel] = useState<number>(0);

  // References
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const aiUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const isComponentActiveRef = useRef<boolean>(false);
  const activeAiAbortRef = useRef<AbortController | null>(null);

  // Helper to send query to AI
  const handleProcessSpeech = useCallback(
    async (speechText: string) => {
      if (!speechText.trim()) return;

      setStatus("thinking");
      setUserTranscript(speechText);
      setInterimTranscript("");

      const userMsgId = `usr_${Date.now()}`;
      setCallHistory((prev) => [...prev, { role: "user", text: speechText, id: userMsgId }]);
      if (onTranscriptMessage) onTranscriptMessage("user", speechText);

      // Stop speech recognition while AI is thinking/speaking
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }

      const abortController = new AbortController();
      activeAiAbortRef.current = abortController;

      try {
        const isCloudModel = !models.some((m) => m.name === selectedModel);
        let fullAiResponse = "";

        const effectiveTone = activeVoice.tone || "casual";
        if (onSendMessage) {
          fullAiResponse = await onSendMessage(speechText, effectiveTone);
          setAiTranscript(fullAiResponse);
        } else {
          const toneInstruction =
            effectiveTone === "casual"
              ? "Gunakan bahasa santai, akrab, dan luwes (aku-kamu, partikel ya, nih, deh). Jawab ringkas 1-3 kalimat saja."
              : effectiveTone === "concise"
              ? "Jawab langsung to the point, ringkas dan akurat dalam 1-2 kalimat tanpa basa-basi."
              : "Jawablah dengan ramah, hangat, komunikatif, dan ringkas dalam 1-3 kalimat saja.";
          const defaultVoiceSys = `${systemPrompt || ""}\n${toneInstruction}`.trim();

          const messages = [
            { role: "system", content: defaultVoiceSys },
            ...callHistory.slice(-4).map((m) => ({ role: m.role, content: m.text })),
            { role: "user", content: speechText },
          ];

          if (isCloudModel) {
            const res = await apiFetch("/api/cloud/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messages,
                model: selectedModel,
                apiKeys,
                stream: true,
              }),
              signal: abortController.signal,
            });

            if (!res.ok) throw new Error(`Cloud API error status ${res.status}`);
            const reader = res.body?.getReader();
            const decoder = new TextDecoder();

            if (reader) {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                fullAiResponse += decoder.decode(value);
                setAiTranscript(fullAiResponse);
              }
            }
          } else {
            const res = await apiFetch("/api/ollama/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                model: selectedModel || models[0]?.name || "llama3.1:latest",
                messages,
                stream: false,
              }),
              signal: abortController.signal,
            });

            if (!res.ok) throw new Error("Ollama model error");
            const data = await res.json();
            fullAiResponse = data.message?.content || "Maaf, tidak ada respon.";
            setAiTranscript(fullAiResponse);
          }
        }

        if (!isComponentActiveRef.current) return;

        const aiMsgId = `ai_${Date.now()}`;
        setCallHistory((prev) => [...prev, { role: "assistant", text: fullAiResponse, id: aiMsgId }]);
        if (onTranscriptMessage) onTranscriptMessage("assistant", fullAiResponse);

        // Speak response via configured VoiceEngine
        setStatus("speaking");

        const targetVoice = resolveVoiceForConfig(
          {
            presetId: activeVoice.presetId,
            voiceName: activeVoice.voiceName,
            pitch: activeVoice.pitch,
            rate: activeVoice.rate,
          },
          getAllSystemVoices()
        );

        aiUtteranceRef.current = speakUniversal({
          text: fullAiResponse,
          voice: targetVoice,
          pitch: activeVoice.pitch,
          rate: activeVoice.rate,
          onStart: () => {
            setStatus("speaking");
          },
          onEnd: () => {
            if (!isComponentActiveRef.current) return;
            setStatus("listening");
            setUserTranscript("");
            setAiTranscript("");
            startSpeechRecognition();
          },
          onError: () => {
            if (!isComponentActiveRef.current) return;
            setStatus("listening");
            startSpeechRecognition();
          },
        });
      } catch (err: any) {
        if (err.name === "AbortError") return;
        setStatus("listening");
        startSpeechRecognition();
      }
    },
    [selectedModel, models, apiKeys, systemPrompt, callHistory, activeVoice, onTranscriptMessage, onSendMessage]
  );

  // Initialize and start Speech Recognition
  const startSpeechRecognition = useCallback(() => {
    if (typeof window === "undefined" || isMuted || !isComponentActiveRef.current) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onstart = () => {
      if (isComponentActiveRef.current) {
        setStatus((prev) => (prev === "speaking" ? prev : "listening"));
      }
    };

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      setInterimTranscript(interim);

      // If user starts speaking while AI is talking, interrupt AI!
      if (status === "speaking" && (interim.trim() || final.trim())) {
        stopSpeaking();
        if (activeAiAbortRef.current) activeAiAbortRef.current.abort();
        setStatus("listening");
      }

      if (final.trim()) {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        handleProcessSpeech(final.trim());
      } else if (interim.trim()) {
        // Auto-silence timer: respects sensitivity configured in Settings
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        const silenceDelay = activeVoice.autoSilenceMs || 1400;
        silenceTimerRef.current = setTimeout(() => {
          if (interim.trim()) {
            handleProcessSpeech(interim.trim());
          }
        }, silenceDelay);
      }
    };

    recognition.onerror = (event: any) => {
      // Ignore routine aborts
      if (event.error === "no-speech" || event.error === "aborted") return;
    };

    recognition.onend = () => {
      // Auto reconnect speech recognition if still in listening state and active
      if (isComponentActiveRef.current && status === "listening" && !isMuted) {
        try {
          recognition.start();
        } catch {}
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch {}
  }, [isMuted, lang, status, handleProcessSpeech, activeVoice.autoSilenceMs]);

  // Setup Web Audio API for Mic Waveform Visualization
  const setupAudioVisualizer = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateVolume = () => {
        if (!isComponentActiveRef.current) return;
        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const normalized = Math.min(avg / 128, 1);
        setMicLevel(normalized);

        animFrameRef.current = requestAnimationFrame(updateVolume);
      };

      updateVolume();
    } catch (err) {
      console.warn("Microphone visualizer initialization skipped:", err);
    }
  };

  // Lifecycle: open & close modal
  useEffect(() => {
    if (!isOpen) return;

    isComponentActiveRef.current = true;
    setStatus("listening");
    setupAudioVisualizer();
    startSpeechRecognition();

    return () => {
      isComponentActiveRef.current = false;
      stopSpeaking();

      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch {}
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (activeAiAbortRef.current) {
        activeAiAbortRef.current.abort();
      }
    };
  }, [isOpen]);

  // Simulate pulse level when AI is speaking
  useEffect(() => {
    let interval: any;
    if (status === "speaking") {
      interval = setInterval(() => {
        setAiLevel(0.4 + Math.random() * 0.55);
      }, 100);
    } else {
      setAiLevel(0);
    }
    return () => clearInterval(interval);
  }, [status]);

  if (!isOpen) return null;

  // Visual Orb Scale calculation based on audio energy
  const orbScale =
    status === "speaking"
      ? 1 + aiLevel * 0.4
      : status === "listening"
      ? 1 + micLevel * 0.6
      : status === "thinking"
      ? 1.15
      : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-2xl text-white select-none animate-in fade-in duration-200">
      {/* Background Ambient Glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] rounded-full blur-[130px] transition-all duration-700 ${
            status === "speaking"
              ? "bg-purple-600/30"
              : status === "thinking"
              ? "bg-amber-500/25"
              : "bg-emerald-500/25"
          }`}
        />
      </div>

      {/* Top Header Bar */}
      <header className="absolute top-0 inset-x-0 p-4 sm:p-6 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shadow-lg backdrop-blur-md">
            <Volume2 className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-tight">Ollama Voice Mode</h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase tracking-wider">
                Hands-Free
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Model: {selectedModel || "Local AI"} • Karakter: {currentPreset.name} • Natural Voice
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Settings Shortcut Button */}
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-medium transition-colors cursor-pointer text-purple-300 hover:text-white"
              title="Pengaturan Suara & Artikulasi"
            >
              <Settings2 className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">Pengaturan Suara</span>
            </button>
          )}

          {/* Language Toggle */}
          <button
            onClick={() => {
              const next = lang === "id-ID" ? "en-US" : "id-ID";
              setLang(next);
              if (recognitionRef.current) {
                recognitionRef.current.lang = next;
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-medium transition-colors cursor-pointer"
            title="Switch speech recognition language"
          >
            <Globe className="w-3.5 h-3.5 text-blue-400" />
            <span>{lang === "id-ID" ? "ID" : "EN"}</span>
          </button>

          {/* Close / End Call */}
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-rose-600/80 border border-white/15 hover:border-rose-500 text-white transition-all cursor-pointer"
            title="Tutup Panggilan Suara"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Center Animated Voice Orb */}
      <div className="relative flex flex-col items-center justify-center z-10 max-w-xl mx-auto px-4 py-4">
        {/* Dynamic 3D Glowing Gradient Sphere (Orb) - NO mic icon inside */}
        <div className="relative flex items-center justify-center w-72 h-72 sm:w-84 sm:h-84">
          {/* Ambient Outer Aura Blur */}
          <div
            style={{
              transform: `scale(${orbScale * 1.4})`,
            }}
            className={`absolute w-64 h-64 sm:w-80 sm:h-80 rounded-full blur-[70px] opacity-70 transition-all duration-300 pointer-events-none ${
              status === "speaking"
                ? "bg-gradient-to-tr from-purple-600 via-fuchsia-500 to-indigo-600"
                : status === "thinking"
                ? "bg-gradient-to-tr from-amber-500 via-orange-500 to-yellow-400"
                : "bg-gradient-to-tr from-cyan-500 via-teal-400 to-indigo-600"
            }`}
          />

          {/* Harmonic Ripple Shockwaves (Expands dynamically on Audio Energy) */}
          <div
            style={{ transform: `scale(${orbScale * 1.25})` }}
            className={`absolute w-56 h-56 sm:w-72 sm:h-72 rounded-full border transition-all duration-150 pointer-events-none ${
              status === "speaking"
                ? "border-purple-400/40 shadow-[0_0_50px_rgba(168,85,247,0.4)]"
                : status === "thinking"
                ? "border-amber-400/40 shadow-[0_0_50px_rgba(251,191,36,0.35)] animate-spin"
                : "border-cyan-400/40 shadow-[0_0_50px_rgba(6,182,212,0.35)]"
            }`}
          />

          <div
            style={{ transform: `scale(${orbScale * 1.12})` }}
            className={`absolute w-48 h-48 sm:w-64 sm:h-64 rounded-full border transition-all duration-200 pointer-events-none ${
              status === "speaking"
                ? "border-pink-400/30"
                : status === "thinking"
                ? "border-yellow-300/30"
                : "border-teal-300/30"
            }`}
          />

          {/* The 3D Fluid Gradient Sphere Body - Pure visual liquid orb, ZERO mic icon inside */}
          <div
            style={{ transform: `scale(${orbScale})` }}
            className="w-48 h-48 sm:w-60 sm:h-60 rounded-full relative overflow-hidden transition-transform duration-100 ease-out select-none shadow-[0_30px_70px_-10px_rgba(0,0,0,0.9),_inset_0_-20px_40px_rgba(0,0,0,0.6),_inset_0_12px_28px_rgba(255,255,255,0.45)] cursor-pointer"
          >
            {/* Layer 1: Base rich 3D sphere gradient */}
            <div
              className={`absolute inset-0 transition-colors duration-700 ${
                status === "speaking"
                  ? "bg-gradient-to-br from-indigo-700 via-purple-700 to-pink-600"
                  : status === "thinking"
                  ? "bg-gradient-to-br from-amber-600 via-orange-600 to-rose-600"
                  : "bg-gradient-to-br from-blue-700 via-teal-600 to-indigo-900"
              }`}
            />

            {/* Layer 2: Rotating Ethereal Fluid Conic Swirl */}
            <div
              className={`absolute inset-[-40%] rounded-full opacity-80 blur-lg transition-all ${
                status === "thinking"
                  ? "animate-[spin_4s_linear_infinite]"
                  : status === "speaking"
                  ? "animate-[spin_6s_linear_infinite]"
                  : "animate-[spin_10s_linear_infinite]"
              } ${
                status === "speaking"
                  ? "bg-[conic-gradient(from_0deg,#9333ea,#ec4899,#06b6d4,#a855f7,#ec4899,#9333ea)]"
                  : status === "thinking"
                  ? "bg-[conic-gradient(from_0deg,#d97706,#f59e0b,#ef4444,#eab308,#f97316,#d97706)]"
                  : "bg-[conic-gradient(from_0deg,#06b6d4,#3b82f6,#8b5cf6,#14b8a6,#06b6d4)]"
              }`}
            />

            {/* Layer 3: Dynamic Pulsing Core Light */}
            <div
              className={`absolute inset-4 rounded-full blur-sm opacity-70 transition-all duration-150 ${
                status === "speaking"
                  ? "bg-radial from-white via-fuchsia-400/40 to-transparent"
                  : status === "thinking"
                  ? "bg-radial from-white via-amber-300/40 to-transparent"
                  : "bg-radial from-white via-cyan-300/40 to-transparent"
              }`}
              style={{
                transform: `scale(${0.85 + (status === "speaking" ? aiLevel * 0.35 : micLevel * 0.45)})`,
              }}
            />

            {/* Layer 4: 3D Glossy Specular Highlight Sheen */}
            <div className="absolute top-2.5 left-5 w-24 h-14 rounded-[100%_100%_60%_60%] bg-gradient-to-b from-white/60 via-white/20 to-transparent blur-[1px] rotate-[-28deg] pointer-events-none" />

            {/* Layer 5: Internal Edge Ambient Shadow for true Spherical 3D Volume */}
            <div className="absolute inset-0 rounded-full shadow-[inset_0_0_30px_rgba(0,0,0,0.5),_inset_0_-15px_30px_rgba(0,0,0,0.7)] pointer-events-none" />
          </div>
        </div>

        {/* Live Status Label - Placed comfortably with full clearance from ripple waves */}
        <div className="text-center space-y-2.5 max-w-md px-4 mt-16 sm:mt-24">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs font-semibold backdrop-blur-md">
            <span
              className={`w-2 h-2 rounded-full ${
                status === "speaking"
                  ? "bg-purple-400 animate-pulse"
                  : status === "thinking"
                  ? "bg-amber-400 animate-spin"
                  : "bg-cyan-400 animate-pulse"
              }`}
            />
            <span>
              {status === "speaking"
                ? `${currentPreset.name} sedang berbicara...`
                : status === "thinking"
                ? "Sedang berpikir..."
                : "Mendengarkan suaramu..."}
            </span>
          </div>

          {/* Live User Interim Transcript */}
          {interimTranscript && (
            <p className="text-sm font-medium text-cyan-300 italic animate-in fade-in">
              &ldquo;{interimTranscript}&rdquo;
            </p>
          )}

          {!interimTranscript && status === "listening" && (
            <p className="text-xs text-slate-400">
              Bicara langsung secara alami. AI akan merespon otomatis begitu kamu berhenti bicara.
            </p>
          )}

          {/* Quick link to settings */}
          {onOpenSettings && (
            <div className="pt-2">
              <button
                type="button"
                onClick={onOpenSettings}
                className="text-[11px] text-slate-400 hover:text-purple-300 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Settings2 className="w-3 h-3" />
                <span>Karakter, intonasi & kecepatan suara dapat disetel di Pengaturan</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Floating Control Bar */}
      <footer className="absolute bottom-6 inset-x-0 flex items-center justify-center gap-4 z-20">
        {/* Mute Mic Toggle */}
        <button
          onClick={() => {
            const next = !isMuted;
            setIsMuted(next);
            if (next && recognitionRef.current) {
              try {
                recognitionRef.current.abort();
              } catch {}
            } else if (!next) {
              startSpeechRecognition();
            }
          }}
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-xl border transition-all active:scale-95 cursor-pointer ${
            isMuted
              ? "bg-rose-600 hover:bg-rose-500 border-rose-400 text-white"
              : "bg-white/15 hover:bg-white/25 border-white/20 text-white"
          }`}
          title={isMuted ? "Unmute microphone" : "Mute microphone"}
        >
          {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>

        {/* Interrupt / Stop AI Speech */}
        {status === "speaking" && (
          <button
            onClick={() => {
              stopSpeaking();
              setStatus("listening");
              startSpeechRecognition();
            }}
            className="w-14 h-14 rounded-full flex items-center justify-center bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-xl border border-amber-300 active:scale-95 transition-all cursor-pointer"
            title="Interrupt AI and speak"
          >
            <Zap className="w-6 h-6" />
          </button>
        )}

        {/* End Call Button */}
        <button
          onClick={onClose}
          className="w-14 h-14 rounded-full flex items-center justify-center bg-rose-600 hover:bg-rose-500 text-white shadow-2xl shadow-rose-600/40 border border-rose-400 active:scale-95 transition-all cursor-pointer"
          title="End Voice Call"
        >
          <PhoneOff className="w-6 h-6" />
        </button>
      </footer>
    </div>
  );
};
