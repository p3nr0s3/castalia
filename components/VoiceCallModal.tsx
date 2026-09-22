"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Microphone as Mic, PhoneDisconnect as PhoneOff, SpeakerHigh as Volume2, CaretDown as ChevronDown, ArrowCounterClockwise as RotateCcw, Play, Check } from "@phosphor-icons/react";
import {
  speakUniversal,
  stopSpeaking,
  getAllSystemVoices,
  resolveVoiceForConfig,
  previewVoice,
  VOICE_PRESETS,
  TONE_OPTIONS,
  DEFAULT_VOICE_CONFIG,
  VoiceConfig,
  ToneMode,
} from "@/lib/voiceEngine";
import { PixelEyesAvatar } from "./PixelEyesAvatar";

export type VoiceCallStatus = "idle" | "listening" | "thinking" | "speaking";

interface VoiceCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedModel: string;
  onSendMessage: (text: string, tone?: string) => Promise<string>;
}

export const VoiceCallModal: React.FC<VoiceCallModalProps> = ({
  isOpen,
  onClose,
  selectedModel,
  onSendMessage,
}) => {
  const [status, setStatus] = useState<VoiceCallStatus>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [userTranscript, setUserTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [aiResponse, setAiResponse] = useState("");

  // Voice & Tone Configuration State
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("interactive_chat_voice_config");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return DEFAULT_VOICE_CONFIG;
  });

  const [selectedTone, setSelectedTone] = useState<ToneMode>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("interactive_chat_tone");
        if (saved && (saved === "casual" || saved === "warm" || saved === "concise")) {
          return saved as ToneMode;
        }
      } catch {}
    }
    return "casual"; // Default: Santai & Akrab (Casual)
  });

  const [allVoices, setAllVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [showTonePicker, setShowTonePicker] = useState(false);
  const [activeVoiceTab, setActiveVoiceTab] = useState<"presets" | "all" | "tuning">("presets");
  const [isPreviewing, setIsPreviewing] = useState(false);

  // References
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isListeningRef = useRef(false);
  const statusRef = useRef<VoiceCallStatus>("idle");
  const accumulatedSpeechRef = useRef("");
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Keep statusRef synchronized
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Persist Voice Config to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("interactive_chat_voice_config", JSON.stringify(voiceConfig));
      } catch {}
    }
  }, [voiceConfig]);

  // Persist Tone Mode to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("interactive_chat_tone", selectedTone);
      } catch {}
    }
  }, [selectedTone]);

  // Discover and initialize voices on mount
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const updateVoices = () => {
      const v = getAllSystemVoices();
      setAllVoices(v);
    };

    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  // Stop speech recognition helper
  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }
    isListeningRef.current = false;
  }, []);

  // Process user speech when silence is detected
  const handleUserFinishedSpeaking = useCallback(async (spokenText: string) => {
    const query = spokenText.trim();
    if (!query) {
      setStatus("idle");
      return;
    }

    stopListening();
    setStatus("thinking");
    setInterimText("");
    setUserTranscript(query);
    setAiResponse("");

    try {
      // Query model through parent chat pipeline with selected conversational tone!
      const responseText = await onSendMessage(query, selectedTone);
      setAiResponse(responseText);

      // Transition to speaking with the configured voice
      setStatus("speaking");
      const targetVoice = resolveVoiceForConfig(voiceConfig, allVoices);
      speakUniversal({
        text: responseText,
        voice: targetVoice,
        pitch: voiceConfig.pitch,
        rate: voiceConfig.rate,
        onEnd: () => {
          stopSpeaking();
          accumulatedSpeechRef.current = "";
          setInterimText("");
          setStatus(isMuted ? "idle" : "listening");
        },
        onError: () => {
          stopSpeaking();
          accumulatedSpeechRef.current = "";
          setStatus(isMuted ? "idle" : "listening");
        },
      });
    } catch (err: any) {
      console.error("Interactive chat prompt error:", err);
      const errMsg = `Maaf, ada kendala: ${err.message}`;
      setAiResponse(errMsg);
      setStatus("speaking");
      const targetVoice = resolveVoiceForConfig(voiceConfig, allVoices);
      speakUniversal({
        text: errMsg,
        voice: targetVoice,
        pitch: voiceConfig.pitch,
        rate: voiceConfig.rate,
        onEnd: () => {
          stopSpeaking();
          accumulatedSpeechRef.current = "";
          setStatus(isMuted ? "idle" : "listening");
        },
      });
    }
  }, [allVoices, isMuted, onSendMessage, selectedTone, stopListening, voiceConfig]);

  // Start speech recognition helper
  const startListening = useCallback(() => {
    if (typeof window === "undefined" || isMuted) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Browser Anda belum mendukung Speech Recognition. Gunakan Google Chrome, Microsoft Edge, atau Safari.");
      return;
    }

    // Ensure audio output is stopped before starting recognition
    stopSpeaking();
    stopListening();

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "id-ID";

      recognition.onstart = () => {
        isListeningRef.current = true;
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = setTimeout(() => {
          if (statusRef.current === "listening") {
            setIsMuted(true);
            stopListening();
            setStatus("idle");
          }
        }, 45000);
      };

      recognition.onresult = (event: any) => {
        // If AI was speaking and user begins talking, stop AI immediately
        if (statusRef.current === "speaking") {
          stopSpeaking();
          setStatus("listening");
        }

        let finalPart = "";
        let interimPart = "";

        for (let i = 0; i < event.results.length; i++) {
          const item = event.results[i];
          if (item.isFinal) {
            finalPart += item[0].transcript + " ";
          } else {
            interimPart += item[0].transcript;
          }
        }

        // Any recognition activity (even interim) counts as "not idle" — reset the long inactivity timer
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = setTimeout(() => {
          // Nobody has said anything at all for a long while — auto-mute to stop burning mic/CPU
          if (statusRef.current === "listening") {
            setIsMuted(true);
            stopListening();
            setStatus("idle");
          }
        }, 45000);

        const totalSpoken = (finalPart + interimPart).trim();
        if (totalSpoken) {
          accumulatedSpeechRef.current = totalSpoken;
          setInterimText(totalSpoken);

          // Reset silence timer on every speech event (VAD debounce: 1.6s of silence triggers sending)
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            if (accumulatedSpeechRef.current.trim() && statusRef.current === "listening") {
              handleUserFinishedSpeaking(accumulatedSpeechRef.current);
            }
          }, 1600);
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error !== "no-speech") {
          console.warn("Speech recognition notice:", event.error);
        }
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          isListeningRef.current = false;
          setStatus("idle");
        }
      };

      recognition.onend = () => {
        isListeningRef.current = false;
        // If we should still be listening and not in another state, restart with a fresh instance
        if (statusRef.current === "listening" && !isMuted) {
          setTimeout(() => {
            if (statusRef.current === "listening") {
              startListening();
            }
          }, 120);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      isListeningRef.current = true;
    } catch (err) {
      console.error("Failed to start speech recognition:", err);
      isListeningRef.current = false;
    }
  }, [handleUserFinishedSpeaking, isMuted, stopListening]);

  // Lifecycle when modal opens / closes or status transitions
  useEffect(() => {
    if (isOpen) {
      accumulatedSpeechRef.current = "";
      setUserTranscript("");
      setInterimText("");
      setAiResponse("");
      setStatus(isMuted ? "idle" : "listening"); // Auto-open mic on modal open (hands-free mode)
    } else {
      stopSpeaking();
      stopListening();
      setStatus("idle");
    }
  }, [isOpen, isMuted, stopListening]);

  // Manage listening state based on status & mute
  useEffect(() => {
    if (!isOpen) return;

    if (status === "listening" && !isMuted) {
      startListening();
    } else if (status !== "listening" || isMuted) {
      stopListening();
    }
  }, [status, isMuted, isOpen, startListening, stopListening]);

  // Interrupt AI when user taps screen or presses interrupt button
  const handleInterrupt = () => {
    stopSpeaking();
    setAiResponse("");
    accumulatedSpeechRef.current = "";
    setInterimText("");
    setStatus("idle");
  };

  // Mute Toggle (hands-free mode: mic is automatic, this button pauses/resumes it)
  const handleToggleMute = () => {
    if (isMuted) {
      // Resume: unmute and re-open mic (unless AI is currently speaking or thinking)
      setIsMuted(false);
      if (statusRef.current === "idle") {
        accumulatedSpeechRef.current = "";
        setInterimText("");
        setStatus("listening");
      }
    } else {
      // Pause: mute and stop listening immediately, send nothing pending
      setIsMuted(true);
      if (statusRef.current === "listening") {
        stopListening();
        setStatus("idle");
      }
    }
  };

  // Manual interrupt while AI is speaking (tap button to cut it off and resume listening)
  const handleClickMic = () => {
    if (status === "speaking") {
      stopSpeaking();
      setStatus(isMuted ? "idle" : "listening");
      return;
    }
    handleToggleMute();
  };

  // Close Call
  const handleEndCall = () => {
    stopSpeaking();
    stopListening();
    onClose();
  };

  // Preview Voice Sample
  const handlePreviewVoice = (configToTest?: VoiceConfig) => {
    stopSpeaking();
    setIsPreviewing(true);
    previewVoice(configToTest || voiceConfig, allVoices, undefined, () => {
      setIsPreviewing(false);
    });
  };

  if (!isOpen) return null;

  const currentPreset = VOICE_PRESETS.find((p) => p.id === voiceConfig.presetId) || VOICE_PRESETS[0];
  const currentTone = TONE_OPTIONS.find((t) => t.id === selectedTone) || TONE_OPTIONS[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-xl animate-fade-in select-none">
      <div className="relative w-full max-w-xl h-[90dvh] max-h-[760px] flex flex-col justify-between items-center rounded-3xl bg-gradient-to-b from-neutral-900/90 via-neutral-900/95 to-black/95 border border-white/10 shadow-2xl p-6 sm:p-8 overflow-hidden">
        {/* Background ambient lighting */}
        <div
          className={`absolute -top-32 -left-32 w-80 h-80 rounded-full blur-3xl opacity-20 pointer-events-none transition-all duration-700 ${
            status === "listening"
              ? "bg-cyan-500"
              : status === "speaking"
              ? "bg-rose-500"
              : status === "thinking"
              ? "bg-purple-500"
              : "bg-neutral-600"
          }`}
        />
        <div
          className={`absolute -bottom-32 -right-32 w-80 h-80 rounded-full blur-3xl opacity-20 pointer-events-none transition-all duration-700 ${
            status === "listening"
              ? "bg-emerald-500"
              : status === "speaking"
              ? "bg-amber-500"
              : status === "thinking"
              ? "bg-blue-500"
              : "bg-neutral-600"
          }`}
        />

        {/* Top Header: Voice Over Selector, Tone Selector, and End Call */}
        <div className="w-full flex items-center justify-between gap-2 z-20">
          <div className="flex items-center gap-2">
            {/* Voice Over Selector Button */}
            <button
              onClick={() => {
                setShowVoicePicker(!showVoicePicker);
                setShowTonePicker(false);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-xs text-neutral-200 transition-colors cursor-pointer backdrop-blur-md active:scale-95"
              title="Pilih Karakter & Suara Voice Over"
            >
              <span className="text-sm">{currentPreset.icon}</span>
              <span className="truncate max-w-[100px] sm:max-w-[140px] font-medium">
                {voiceConfig.presetId === "system_custom" && voiceConfig.voiceName
                  ? voiceConfig.voiceName.split(" ")[0]
                  : currentPreset.name}
              </span>
              <ChevronDown className="w-3 h-3 opacity-70" />
            </button>

            {/* Gaya Bahasa (Tone) Selector Button */}
            <button
              onClick={() => {
                setShowTonePicker(!showTonePicker);
                setShowVoicePicker(false);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-xs text-cyan-300 transition-colors cursor-pointer backdrop-blur-md active:scale-95"
              title="Atur Gaya Bahasa AI (Santai / Ramah / Singkat)"
            >
              <span className="text-sm">{currentTone.icon}</span>
              <span className="font-medium hidden sm:inline">{currentTone.label}</span>
              <span className="font-medium sm:hidden">
                {selectedTone === "casual" ? "Santai" : selectedTone === "warm" ? "Ramah" : "Singkat"}
              </span>
              <ChevronDown className="w-3 h-3 opacity-70" />
            </button>
          </div>

          <button
            onClick={handleEndCall}
            className="p-2 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Tutup Interactive Chat"
          >
            <PhoneOff className="w-5 h-5 text-neutral-400 hover:text-rose-400 transition-colors" />
          </button>
        </div>

        {/* Tone Picker Popover */}
        {showTonePicker && (
          <div className="absolute top-16 left-4 right-4 sm:left-6 sm:w-80 z-30 p-3.5 rounded-2xl bg-neutral-900/95 border border-cyan-500/30 shadow-2xl backdrop-blur-2xl animate-scale-in">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>Gaya Bahasa AI</span>
                <span className="text-[10px] text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded-full">Percakapan</span>
              </span>
              <button
                onClick={() => setShowTonePicker(false)}
                className="text-xs text-neutral-400 hover:text-white cursor-pointer"
              >
                Tutup
              </button>
            </div>
            <div className="space-y-1.5">
              {TONE_OPTIONS.map((tone) => (
                <button
                  key={tone.id}
                  onClick={() => {
                    setSelectedTone(tone.id);
                    setShowTonePicker(false);
                  }}
                  className={`w-full text-left p-2.5 rounded-xl text-xs flex items-start gap-2.5 transition-all cursor-pointer ${
                    selectedTone === tone.id
                      ? "bg-cyan-500/20 text-cyan-200 border border-cyan-500/40"
                      : "text-neutral-300 hover:bg-white/5 border border-transparent"
                  }`}
                >
                  {tone.icon && <span className="text-xl mt-0.5">{tone.icon}</span>}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{tone.label}</span>
                      <span className="text-[10px] text-cyan-400/80 font-mono">{tone.badge}</span>
                    </div>
                    <p className="text-[11px] text-neutral-400 mt-0.5 leading-snug">{tone.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Voice Over Picker Popover */}
        {showVoicePicker && (
          <div className="absolute top-16 left-4 right-4 sm:left-6 sm:right-6 z-30 p-4 rounded-2xl bg-neutral-900/95 border border-white/15 shadow-2xl backdrop-blur-2xl animate-scale-in max-h-[75vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-white/10 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-cyan-400" />
                <span className="text-xs sm:text-sm font-bold text-white">Karakter & Suara Voice Over</span>
              </div>
              <button
                onClick={() => {
                  setShowVoicePicker(false);
                  stopSpeaking();
                  setIsPreviewing(false);
                }}
                className="text-xs text-neutral-400 hover:text-white cursor-pointer"
              >
                Tutup
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-black/40 rounded-xl mb-3 flex-shrink-0">
              <button
                onClick={() => setActiveVoiceTab("presets")}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  activeVoiceTab === "presets" ? "bg-white/15 text-white shadow-xs" : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                Karakter
              </button>
              <button
                onClick={() => setActiveVoiceTab("all")}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  activeVoiceTab === "all" ? "bg-white/15 text-white shadow-xs" : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                Semua Suara ({allVoices.length})
              </button>
              <button
                onClick={() => setActiveVoiceTab("tuning")}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  activeVoiceTab === "tuning" ? "bg-white/15 text-white shadow-xs" : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                Nada & Kecepatan
              </button>
            </div>

            {/* Tab 1: Presets */}
            {activeVoiceTab === "presets" && (
              <div className="overflow-y-auto space-y-2 pr-1 touch-scroll flex-1 max-h-56">
                {VOICE_PRESETS.map((preset) => {
                  const isSelected = voiceConfig.presetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => {
                        const nextConfig: VoiceConfig = {
                          ...voiceConfig,
                          presetId: preset.id,
                          pitch: preset.defaultPitch,
                          rate: preset.defaultRate,
                        };
                        setVoiceConfig(nextConfig);
                      }}
                      className={`w-full text-left p-2.5 sm:p-3 rounded-xl flex items-center justify-between gap-3 transition-all cursor-pointer ${
                        isSelected
                          ? "bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 shadow-sm"
                          : "text-neutral-300 hover:bg-white/5 border border-white/5"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {preset.icon && <span className="text-2xl">{preset.icon}</span>}
                        <div className="min-w-0">
                          <div className="font-semibold text-xs sm:text-sm text-white flex items-center gap-2">
                            <span>{preset.label}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                          </div>
                          <p className="text-[11px] text-neutral-400 truncate mt-0.5">{preset.desc}</p>
                        </div>
                      </div>
                      <div className="text-[10px] text-neutral-500 font-mono flex-shrink-0">
                        {preset.defaultPitch.toFixed(2)}x / {preset.defaultRate.toFixed(2)}x
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Tab 2: All Installed System Voices */}
            {activeVoiceTab === "all" && (
              <div className="overflow-y-auto space-y-1.5 pr-1 touch-scroll flex-1 max-h-56">
                {/* Indonesian Voices Section */}
                <div className="text-[11px] font-semibold text-neutral-400 px-2 py-1 uppercase tracking-wider">
                  Bahasa Indonesia
                </div>
                {allVoices.filter((v) => v.lang.toLowerCase().startsWith("id")).length > 0 ? (
                  allVoices
                    .filter((v) => v.lang.toLowerCase().startsWith("id"))
                    .map((v) => {
                      const isSelected = voiceConfig.voiceName === v.name;
                      return (
                        <button
                          key={v.name}
                          onClick={() => {
                            setVoiceConfig({
                              ...voiceConfig,
                              presetId: "system_custom",
                              voiceName: v.name,
                            });
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 font-semibold"
                              : "text-neutral-300 hover:bg-white/5 border border-transparent"
                          }`}
                        >
                          <span className="truncate">{v.name}</span>
                          <span className="text-[10px] text-neutral-400 font-mono ml-2">{v.lang}</span>
                        </button>
                      );
                    })
                ) : (
                  <div className="text-xs text-neutral-500 px-3 py-2 italic">
                    Suara bawaan sistem aktif secara otomatis.
                  </div>
                )}

                {/* Other Global Voices Section */}
                <div className="text-[11px] font-semibold text-neutral-400 px-2 py-1 mt-2 uppercase tracking-wider">
                  Suara Sistem & Global Lainnya
                </div>
                {allVoices
                  .filter((v) => !v.lang.toLowerCase().startsWith("id"))
                  .slice(0, 30)
                  .map((v) => {
                    const isSelected = voiceConfig.voiceName === v.name;
                    return (
                      <button
                        key={v.name}
                        onClick={() => {
                          setVoiceConfig({
                            ...voiceConfig,
                            presetId: "system_custom",
                            voiceName: v.name,
                          });
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 font-semibold"
                            : "text-neutral-300 hover:bg-white/5 border border-transparent"
                        }`}
                      >
                        <span className="truncate">{v.name}</span>
                        <span className="text-[10px] text-neutral-400 font-mono ml-2">{v.lang}</span>
                      </button>
                    );
                  })}
              </div>
            )}

            {/* Tab 3: Pitch & Rate Sliders */}
            {activeVoiceTab === "tuning" && (
              <div className="space-y-4 py-2 flex-1">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-neutral-300 font-medium">Nada Suara (Pitch)</span>
                    <span className="text-cyan-400 font-mono font-semibold">{voiceConfig.pitch.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.6"
                    max="1.6"
                    step="0.05"
                    value={voiceConfig.pitch}
                    onChange={(e) =>
                      setVoiceConfig({ ...voiceConfig, pitch: parseFloat(e.target.value) })
                    }
                    className="w-full accent-cyan-400 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-neutral-500 mt-1">
                    <span>Berat / Rendah (0.6x)</span>
                    <span>Tinggi / Melengking (1.6x)</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-neutral-300 font-medium">Kecepatan Bicara (Speed)</span>
                    <span className="text-cyan-400 font-mono font-semibold">{voiceConfig.rate.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.7"
                    max="1.5"
                    step="0.05"
                    value={voiceConfig.rate}
                    onChange={(e) =>
                      setVoiceConfig({ ...voiceConfig, rate: parseFloat(e.target.value) })
                    }
                    className="w-full accent-cyan-400 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-neutral-500 mt-1">
                    <span>Santai / Pelan (0.7x)</span>
                    <span>Cepat (1.5x)</span>
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Bar: Test Voice Button */}
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between flex-shrink-0">
              <span className="text-[11px] text-neutral-400">
                Karakter:{" "}
                <span className="text-cyan-300 font-semibold">
                  {currentPreset.name}
                </span>
              </span>
              <button
                onClick={() => handlePreviewVoice()}
                disabled={isPreviewing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <Play className={`w-3.5 h-3.5 fill-current ${isPreviewing ? "animate-pulse text-neutral-700" : ""}`} />
                <span>{isPreviewing ? "Memutar..." : "Tes Suara"}</span>
              </button>
            </div>
          </div>
        )}

        {/* Center: Expressive Pixel Eyes Avatar & User Transcript */}
        <div className="flex flex-col items-center justify-center my-auto z-10 w-full max-w-lg">
          <PixelEyesAvatar
            status={status}
            isMuted={isMuted}
            userQuery={interimText || userTranscript}
            onInterrupt={handleInterrupt}
          />

          {/* Status Badge */}
          <div className="mt-3 flex flex-col items-center gap-1 text-center px-4">
            <span
              className={`text-sm sm:text-base font-semibold tracking-wide transition-colors ${
                status === "listening"
                  ? "text-cyan-400"
                  : status === "speaking"
                  ? "text-rose-400"
                  : status === "thinking"
                  ? "text-purple-400"
                  : "text-neutral-400"
              }`}
            >
              {status === "listening"
                ? "Mendengarkan Anda... (Tekan selesai untuk kirim)"
                : status === "thinking"
                ? "Sedang Berpikir..."
                : status === "speaking"
                ? "Sedang Berbicara (Ketuk untuk menyela)"
                : "Siap Bicara (Tekan Tombol Mic)"}
            </span>
          </div>

          {/* Transparent Live Dictation Display (No Bubble Box) */}
          <div className="w-full min-h-[64px] max-h-28 overflow-y-auto flex items-center justify-center px-6 mt-4 touch-scroll">
            {interimText ? (
              // Live Dictation mode with pulsing caret
              <div className="w-full text-center animate-fade-in select-text">
                <span className="text-base sm:text-lg font-medium text-cyan-200 tracking-wide leading-relaxed drop-shadow-[0_2px_10px_rgba(34,211,238,0.25)]">
                  "{interimText}"
                </span>
                <span className="inline-block w-1.5 h-4 sm:h-5 bg-cyan-400 animate-pulse ml-1.5 align-middle rounded-xs shadow-[0_0_8px_#22d3ee]" />
              </div>
            ) : userTranscript ? (
              // Final Transcribed question post-processing
              <div className="w-full text-center animate-fade-in select-text">
                <span className="text-base sm:text-lg font-medium text-neutral-200 tracking-wide leading-relaxed">
                  "{userTranscript}"
                </span>
              </div>
            ) : (
              // Idle hint
              <div className="text-center text-xs sm:text-sm text-neutral-500 italic tracking-wide">
                {status === "idle"
                  ? "Tekan tombol mikrofon untuk mulai mendikte ucapan..."
                  : status === "listening"
                  ? "Mendengarkan... Silakan mendikte kata-kata Anda..."
                  : ""}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Call Controls (Hands-Free Mic & End Call) */}
        <div className="w-full flex items-center justify-center gap-4 sm:gap-6 pt-4 z-10">
          {/* Main Mic Button: auto listening/speaking; tap to interrupt AI or mute/unmute */}
          <button
            onClick={handleClickMic}
            disabled={status === "thinking"}
            className={`px-6 sm:px-8 py-3.5 sm:py-4 rounded-full font-semibold flex items-center gap-2.5 transition-all active:scale-95 cursor-pointer select-none ${
              isMuted
                ? "bg-white/10 hover:bg-white/20 border border-white/20 text-neutral-400"
                : status === "listening"
                ? "bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-bold shadow-xl shadow-cyan-500/50 scale-105 animate-pulse"
                : status === "speaking"
                ? "bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300"
                : "bg-white/10 hover:bg-white/20 border border-white/20 text-white shadow-lg"
            }`}
            title={
              isMuted
                ? "Tekan untuk lanjutkan mic (unmute)"
                : status === "listening"
                ? "Mendengarkan... tekan untuk mute"
                : status === "speaking"
                ? "Tekan untuk menyela AI"
                : "Tekan untuk mute"
            }
          >
            {isMuted ? (
              <>
                <Mic className="w-5 h-5 sm:w-6 sm:h-6 text-neutral-500" />
                <span className="text-xs sm:text-sm tracking-wide">Mic Dimatikan</span>
              </>
            ) : status === "listening" ? (
              <>
                <Mic className="w-5 h-5 sm:w-6 sm:h-6 text-neutral-950" />
                <span className="text-xs sm:text-sm tracking-wide">Mendengarkan...</span>
              </>
            ) : status === "speaking" ? (
              <>
                <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6" />
                <span className="text-xs sm:text-sm tracking-wide">Sela AI</span>
              </>
            ) : (
              <>
                <Mic className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400" />
                <span className="text-xs sm:text-sm tracking-wide">Mic Aktif</span>
              </>
            )}
          </button>

          {/* End Call Button */}
          <button
            onClick={handleEndCall}
            className="p-3.5 sm:p-4 rounded-full bg-rose-600/20 hover:bg-rose-600 border border-rose-500/30 text-rose-300 hover:text-white transition-all active:scale-95 cursor-pointer shadow-lg"
            title="Akhiri Interactive Chat"
          >
            <PhoneOff className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};
