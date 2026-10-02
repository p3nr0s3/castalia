"use client";

import React, { useState, useEffect } from "react";
import {
  Headphones,
  Globe,
  Play,
  Square,
} from "@phosphor-icons/react";
import { AppSettings, VoiceSettingsConfig } from "@/lib/types";
import {
  VOICE_PRESETS,
  TONE_OPTIONS,
  getAllSystemVoices,
  resolveVoiceForConfig,
  speakUniversal,
  stopSpeaking,
} from "@/lib/voiceEngine";

interface VoiceTabProps {
  formData: AppSettings;
  setFormData: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export const VoiceTab: React.FC<VoiceTabProps> = ({
  formData,
  setFormData,
}) => {
  const [previewVoicePlaying, setPreviewVoicePlaying] = useState(false);
  const [allSystemVoices, setAllSystemVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const updateVoices = () => {
        setAllSystemVoices(getAllSystemVoices());
      };
      updateVoices();
      window.speechSynthesis.onvoiceschanged = updateVoices;
      return () => {
        if (window.speechSynthesis) {
          window.speechSynthesis.onvoiceschanged = null;
        }
      };
    }
  }, []);

  const updateVoice = (updates: Partial<VoiceSettingsConfig>) => {
    const current: VoiceSettingsConfig = formData.voice || {
      presetId: "female_gadis",
      pitch: 1.05,
      rate: 1.05,
      tone: "casual",
      engine: "natural",
      autoSilenceMs: 1400,
    };
    setFormData({
      ...formData,
      voice: { ...current, ...updates },
    });
  };

  const handleTestVoice = async () => {
    if (previewVoicePlaying) {
      stopSpeaking();
      setPreviewVoicePlaying(false);
      return;
    }

    setPreviewVoicePlaying(true);
    const voiceCfg = formData.voice || {
      presetId: "female_gadis",
      pitch: 1.05,
      rate: 1.05,
      tone: "casual",
      engine: "natural",
      autoSilenceMs: 1400,
    };

    const sample =
      voiceCfg.tone === "casual"
        ? "Halo! Aku asisten AI kamu. Suaraku sekarang jauh lebih natural, komunikatif, dan fasih kan?"
        : voiceCfg.tone === "concise"
        ? "Siap. Menjawab langsung dengan cepat, ringkas, dan akurat."
        : "Halo! Senang bisa membantu Anda hari ini. Ada hal yang ingin Anda tanyakan?";

    const target = resolveVoiceForConfig(
      {
        presetId: voiceCfg.presetId as any,
        voiceName: voiceCfg.voiceName,
        pitch: voiceCfg.pitch,
        rate: voiceCfg.rate,
      },
      allSystemVoices
    );
    speakUniversal({
      text: sample,
      voice: target,
      pitch: voiceCfg.pitch,
      rate: voiceCfg.rate,
      onEnd: () => setPreviewVoicePlaying(false),
      onError: () => setPreviewVoicePlaying(false),
    });
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Header Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-blue-500/10 border border-purple-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Headphones className="w-5 h-5 text-purple-400" />
            <h3 className="text-sm font-bold text-[var(--foreground)]">Voice Call & Speech Synthesis Studio</h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/20 text-purple-300">
              Ultra-Fluent Speech
            </span>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Pilihan suara manusia alami (Microsoft Natural, Google Neural, OpenAI TTS), gaya bicara santai/akrab, dan kontrol artikulasi.
          </p>
        </div>

        {/* Quick Test Audio Button */}
        <button
          type="button"
          onClick={handleTestVoice}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-md shrink-0 cursor-pointer ${
            previewVoicePlaying
              ? "bg-rose-600 hover:bg-rose-700 text-white animate-pulse"
              : "bg-purple-600 hover:bg-purple-700 text-white"
          }`}
        >
          {previewVoicePlaying ? (
            <>
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Hentikan Suara</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Tes Suara Sekarang</span>
            </>
          )}
        </button>
      </div>

      {/* 1. Speech Engine Architecture */}
      <div className="p-4 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-[var(--foreground)]">Voice Engine Provider</div>
            <div className="text-[11px] text-[var(--muted)]">
              Pilih modul sintesis suara untuk percakapan lisan
            </div>
          </div>
          <span className="text-[11px] font-mono font-medium text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-md">
            {formData.voice?.engine === "browser" ? "Browser Standard" : "Microsoft / Google Natural"}
          </span>
        </div>

        <div className="pt-1">
          <select
            value={formData.voice?.engine || "natural"}
            onChange={(e) => updateVoice({ engine: e.target.value as any })}
            className="w-full p-2.5 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:ring-1 focus:ring-purple-500 focus:outline-none cursor-pointer"
          >
            <option value="natural">Natural Neural (Rekomendasi) — Microsoft Natural & Google Neural tanpa robotik (100% Gratis)</option>
            <option value="browser">Browser Offline Default — Suara bawaan SpeechSynthesis OS/browser lokal</option>
          </select>
        </div>
      </div>

      {/* 2. Character Persona Grid (Moved from Voice Call screen) */}
      <div className="p-4 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-[var(--foreground)]">Karakter & Profil Suara</div>
            <div className="text-[11px] text-[var(--muted)]">
              Pilih kepribadian suara AI untuk panggilan suara dan text-to-speech
            </div>
          </div>
          <span className="text-[11px] font-semibold text-purple-400">
            {VOICE_PRESETS.find((p) => p.id === (formData.voice?.presetId || "female_gadis"))?.label}
          </span>
        </div>

        <div className="pt-1">
          <select
            value={formData.voice?.presetId || "female_gadis"}
            onChange={(e) => {
              const preset = VOICE_PRESETS.find((p) => p.id === e.target.value);
              if (preset) {
                updateVoice({
                  presetId: preset.id,
                  pitch: preset.defaultPitch,
                  rate: preset.defaultRate,
                });
              }
            }}
            className="w-full p-2.5 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:ring-1 focus:ring-purple-500 focus:outline-none cursor-pointer"
          >
            {VOICE_PRESETS.filter((p) => p.id !== "system_custom").map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.icon} {preset.name} ({preset.gender === "female" ? "Perempuan" : preset.gender === "male" ? "Laki-laki" : "Robot"}) — {preset.desc}
              </option>
            ))}
          </select>
        </div>

        {/* System Voice Picker Dropdown */}
        <div className="pt-2 border-t border-[var(--card-border)]">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-indigo-400" />
              Pilih Spesifik dari Suara Sistem Browser ({allSystemVoices.length} suara terdeteksi)
            </label>
            {formData.voice?.voiceName && (
              <button
                type="button"
                onClick={() => updateVoice({ voiceName: "" })}
                className="text-[10px] text-purple-400 hover:underline cursor-pointer"
              >
                Gunakan Suara Rekomendasi Otomatis
              </button>
            )}
          </div>
          <select
            value={formData.voice?.voiceName || ""}
            onChange={(e) => updateVoice({ voiceName: e.target.value })}
            className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value="">-- Otomatis Pilih Suara Paling Natural (Neural / Online) --</option>
            {allSystemVoices.map((v) => {
              const isNatural =
                v.name.toLowerCase().includes("natural") ||
                v.name.toLowerCase().includes("online") ||
                v.name.toLowerCase().includes("neural") ||
                v.name.toLowerCase().includes("google");
              const isId = v.lang.toLowerCase().startsWith("id");
              return (
                <option key={v.name} value={v.name}>
                  {isNatural ? "[Natural] " : ""}{v.name} ({v.lang}) {isId ? "• Bahasa Indonesia" : ""}
                </option>
              );
            })}
          </select>
          <p className="text-[10px] text-[var(--muted)] mt-1">
            Tip: Suara [Natural] memiliki artikulasi neural berkualitas tinggi yang tidak terdengar kaku.
          </p>
        </div>
      </div>

      {/* 3. Conversational Tone Mode */}
      <div className="p-4 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-3">
        <div>
          <div className="text-xs font-bold text-[var(--foreground)]">Gaya Percakapan (Tone)</div>
          <div className="text-[11px] text-[var(--muted)]">
            Mengatur bagaimana AI merangkai kata dan intonasi saat menjawab suara
          </div>
        </div>

        <div className="pt-1">
          <select
            value={formData.voice?.tone || "casual"}
            onChange={(e) => updateVoice({ tone: e.target.value as any })}
            className="w-full p-2.5 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:ring-1 focus:ring-purple-500 focus:outline-none cursor-pointer"
          >
            {TONE_OPTIONS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.icon} {t.label} [{t.badge}] — {t.desc}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 4. Fine-Tuning: Pitch, Speed & Silence Sensitivity */}
      <div className="p-4 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-4">
        <div className="text-xs font-bold text-[var(--foreground)]">Kontrol Artikulasi & Deteksi Suara</div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Pitch */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="text-[var(--foreground)] font-semibold">Pitch (Tinggi-Rendah)</label>
              <span className="font-mono text-purple-400 font-semibold">
                {(formData.voice?.pitch ?? 1.05).toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min="0.75"
              max="1.4"
              step="0.05"
              value={formData.voice?.pitch ?? 1.05}
              onChange={(e) => updateVoice({ pitch: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-[var(--card-border)] rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
            <div className="flex justify-between text-[9px] text-[var(--muted)]">
              <span>Bass (0.75x)</span>
              <span>Normal (1.0x)</span>
              <span>Tinggi (1.40x)</span>
            </div>
          </div>

          {/* Speed / Rate */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="text-[var(--foreground)] font-semibold">Kecepatan Bicara</label>
              <span className="font-mono text-purple-400 font-semibold">
                {(formData.voice?.rate ?? 1.05).toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min="0.8"
              max="1.5"
              step="0.05"
              value={formData.voice?.rate ?? 1.05}
              onChange={(e) => updateVoice({ rate: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-[var(--card-border)] rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
            <div className="flex justify-between text-[9px] text-[var(--muted)]">
              <span>Santai (0.8x)</span>
              <span>Normal (1.0x)</span>
              <span>Cepat (1.5x)</span>
            </div>
          </div>

          {/* Auto-Silence Sensitivity */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="text-[var(--foreground)] font-semibold">Jeda Hening Deteksi Bicara</label>
              <span className="font-mono text-purple-400 font-semibold">
                {(formData.voice?.autoSilenceMs ?? 1400)} ms
              </span>
            </div>
            <input
              type="range"
              min="800"
              max="3000"
              step="100"
              value={formData.voice?.autoSilenceMs ?? 1400}
              onChange={(e) => updateVoice({ autoSilenceMs: parseInt(e.target.value) })}
              className="w-full h-1.5 bg-[var(--card-border)] rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
            <div className="flex justify-between text-[9px] text-[var(--muted)]">
              <span>Responsif (0.8s)</span>
              <span>Standar (1.4s)</span>
              <span>Tenang (3.0s)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
