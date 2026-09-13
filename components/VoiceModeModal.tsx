"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
  VolumeX,
  Sparkles,
  RefreshCw,
  Globe,
  Settings2,
  X,
  MessageSquare,
  Bot,
  User,
  Zap,
} from "lucide-react";
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
import { OllamaModel, ApiKeysConfig } from "@/lib/types";
import { apiFetch } from "@/lib/apiClient";

interface VoiceModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedModel: string;
  models: OllamaModel[];
  apiKeys?: ApiKeysConfig;
  systemPrompt?: string;
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
  onTranscriptMessage,
  onSendMessage,
}) => {
  // Call States
  const [status, setStatus] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [lang, setLang] = useState<"id-ID" | "en-US">("id-ID");
  const [selectedPresetId, setSelectedPresetId] = useState<VoicePresetId>("female_gadis");

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

  // Active voice preset
  const currentPreset = VOICE_PRESETS.find((p) => p.id === selectedPresetId) || VOICE_PRESETS[0];

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

        if (onSendMessage) {
          fullAiResponse = await onSendMessage(speechText, "casual");
          setAiTranscript(fullAiResponse);
        } else {
          const messages = [
            { role: "system", content: systemPrompt },
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

        // Speak response via VoiceEngine
        setStatus("speaking");

        const voiceConfig: VoiceConfig = {
          presetId: currentPreset.id,
          pitch: currentPreset.defaultPitch,
          rate: currentPreset.defaultRate,
        };

        const targetVoice = resolveVoiceForConfig(voiceConfig, getAllSystemVoices());

        aiUtteranceRef.current = speakUniversal({
          text: fullAiResponse,
          voice: targetVoice,
          pitch: voiceConfig.pitch,
          rate: voiceConfig.rate,
          onStart: () => {
            setStatus("speaking");
          },
          onEnd: () => {
            if (!isComponentActiveRef.current) return;
            setStatus("listening");
            setUserTranscript("");
            setAiTranscript("");
            // Auto restart recognition for hands-free loop
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
    [selectedModel, models, apiKeys, systemPrompt, callHistory, currentPreset, onTranscriptMessage]
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
        // Auto-silence timer: if user pauses for 1.4s after speaking, process speech
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          if (interim.trim()) {
            handleProcessSpeech(interim.trim());
          }
        }, 1400);
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
  }, [isMuted, lang, status, handleProcessSpeech]);

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
            <Volume2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-tight">Ollama Voice Mode</h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
                Live Hands-Free
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Model: {selectedModel || "Local AI"} • Voice: {currentPreset.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
            title="End voice call"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Center Animated Voice Orb */}
      <div className="relative flex flex-col items-center justify-center space-y-8 z-10">
        {/* Dynamic Glowing Sphere */}
        <div className="relative flex items-center justify-center">
          {/* Ambient Outer Halo Rings */}
          <div
            style={{ transform: `scale(${orbScale * 1.35})` }}
            className={`absolute w-56 h-56 sm:w-64 sm:h-64 rounded-full border transition-all duration-150 ${
              status === "speaking"
                ? "border-purple-500/40 shadow-[0_0_80px_rgba(168,85,247,0.35)]"
                : status === "thinking"
                ? "border-amber-400/40 shadow-[0_0_80px_rgba(251,191,36,0.3)] animate-spin"
                : "border-emerald-500/40 shadow-[0_0_80px_rgba(16,185,129,0.35)]"
            }`}
          />

          <div
            style={{ transform: `scale(${orbScale * 1.15})` }}
            className={`absolute w-44 h-44 sm:w-52 sm:h-52 rounded-full border transition-all duration-200 ${
              status === "speaking"
                ? "border-indigo-400/50"
                : status === "thinking"
                ? "border-amber-300/50"
                : "border-teal-400/50"
            }`}
          />

          {/* Central Fluid Gradient Orb */}
          <div
            style={{ transform: `scale(${orbScale})` }}
            className={`w-36 h-36 sm:w-44 sm:h-44 rounded-full shadow-2xl transition-transform duration-100 ease-out flex items-center justify-center overflow-hidden cursor-pointer ${
              status === "speaking"
                ? "bg-gradient-to-tr from-indigo-600 via-purple-500 to-pink-500 shadow-purple-500/50"
                : status === "thinking"
                ? "bg-gradient-to-tr from-amber-600 via-yellow-500 to-orange-400 shadow-amber-500/50 animate-pulse"
                : "bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-400 shadow-emerald-500/50"
            }`}
          >
            {status === "thinking" ? (
              <RefreshCw className="w-12 h-12 text-white animate-spin opacity-90" />
            ) : status === "speaking" ? (
              <Volume2 className="w-12 h-12 text-white animate-pulse opacity-90" />
            ) : (
              <Mic className={`w-12 h-12 text-white opacity-90 ${micLevel > 0.15 ? "scale-110" : "scale-100"} transition-transform`} />
            )}
          </div>
        </div>

        {/* Live Status Label */}
        <div className="text-center space-y-1.5 max-w-md px-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs font-semibold">
            <span
              className={`w-2 h-2 rounded-full ${
                status === "speaking"
                  ? "bg-purple-400 animate-pulse"
                  : status === "thinking"
                  ? "bg-amber-400 animate-spin"
                  : "bg-emerald-400 animate-pulse"
              }`}
            />
            <span>
              {status === "speaking"
                ? `${currentPreset.name} is speaking...`
                : status === "thinking"
                ? "Thinking..."
                : "Listening to your voice..."}
            </span>
          </div>

          {/* Live User Interim Transcript */}
          {interimTranscript && (
            <p className="text-sm font-medium text-emerald-300 italic animate-in fade-in">
              &ldquo;{interimTranscript}&rdquo;
            </p>
          )}

          {/* AI Response Preview */}
          {aiTranscript && status === "speaking" && (
            <p className="text-xs sm:text-sm text-slate-300 line-clamp-3 leading-relaxed">
              &ldquo;{aiTranscript}&rdquo;
            </p>
          )}

          {!interimTranscript && !aiTranscript && status === "listening" && (
            <p className="text-xs text-slate-400">
              Silakan bicara langsung. AI akan otomatis mendengarkan dan menjawab tanpa perlu mengetik.
            </p>
          )}
        </div>

        {/* Voice Character Persona Switcher */}
        <div className="flex items-center justify-center gap-1.5 p-1 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-md">
          {VOICE_PRESETS.slice(0, 4).map((preset) => {
            const isSelected = preset.id === selectedPresetId;
            return (
              <button
                key={preset.id}
                onClick={() => setSelectedPresetId(preset.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-white text-slate-900 font-bold shadow-md"
                    : "text-slate-300 hover:text-white hover:bg-white/10"
                }`}
              >
                <span>{preset.icon}</span>
                <span>{preset.name}</span>
              </button>
            );
          })}
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
