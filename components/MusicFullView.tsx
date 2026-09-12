"use client";

import React, { useState, useEffect } from "react";
import {
  Music,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Folder,
  FolderOpen,
  Search,
  Sparkles,
  ArrowLeft,
  Radio,
  Sliders,
  Disc3,
  Coffee,
  CloudRain,
  Trees,
  Headphones,
  Zap,
} from "lucide-react";
import {
  AMBIENT_TRACKS,
  AMBIENT_METADATA,
  AmbientTrack,
} from "./MusicPlayerWidget";
import { dispatchMusicAction } from "@/lib/musicBridge";
import { apiFetch } from "@/lib/apiClient";

interface MusicFullViewProps {
  musicDirectory?: string;
  onSaveMusicDirectory?: (dir: string) => void;
  onBackToChat: () => void;
  nowPlayingInfo?: { isPlaying: boolean; title: string; artist?: string; onOpenPlayer?: () => void } | null;
}

interface LocalAudioTrack {
  name: string;
  fullName: string;
  path: string;
  format: string;
  coverUrl?: string;
  folder?: string;
}

export const MusicFullView: React.FC<MusicFullViewProps> = ({
  musicDirectory = "",
  onSaveMusicDirectory,
  onBackToChat,
  nowPlayingInfo,
}) => {
  const [activeTab, setActiveTab] = useState<"ambient" | "local">("ambient");
  const [localDir, setLocalDir] = useState<string>(musicDirectory);
  const [scannedTracks, setScannedTracks] = useState<LocalAudioTrack[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);

  // Scan local music directory
  const handleScanDirectory = async (dirPath?: string) => {
    const targetDir = (dirPath || localDir).trim();
    if (!targetDir) return;

    setIsScanning(true);
    try {
      const res = await apiFetch(`/api/audio?dir=${encodeURIComponent(targetDir)}`);
      if (res.ok) {
        const data = await res.json();
        setScannedTracks(data.tracks || []);
        onSaveMusicDirectory?.(targetDir);
      }
    } catch (e) {
      console.error("Failed to scan music directory:", e);
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (musicDirectory && musicDirectory.trim()) {
      handleScanDirectory(musicDirectory.trim());
    }
  }, []);

  const isPlaying = Boolean(nowPlayingInfo?.isPlaying);
  const currentTitle = nowPlayingInfo?.title || "Ambient Soundscape";
  const currentArtist = nowPlayingInfo?.artist || "Offline Focus Station";

  const handlePlayAmbient = (trackId: string) => {
    dispatchMusicAction({ type: "play", trackId });
  };

  const handlePlayLocalTrack = (track: LocalAudioTrack) => {
    dispatchMusicAction({ type: "play", trackId: track.name });
  };

  const handleTogglePlay = () => {
    dispatchMusicAction({ type: "toggle" });
  };

  const handleNext = () => {
    dispatchMusicAction({ type: "next" });
  };

  const handlePrev = () => {
    dispatchMusicAction({ type: "prev" });
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    dispatchMusicAction({ type: "set-volume", volume: newVol });
    if (newVol > 0 && isMuted) setIsMuted(false);
  };

  const handleToggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      dispatchMusicAction({ type: "set-volume", volume: volume || 0.7 });
    } else {
      setIsMuted(true);
      dispatchMusicAction({ type: "set-volume", volume: 0 });
    }
  };

  const filteredLocalTracks = scannedTracks.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-[100dvh] w-full bg-[var(--background)] text-[var(--foreground)] overflow-hidden select-text">
      {/* Top Header */}
      <header className="h-14 flex-shrink-0 flex items-center justify-between px-4 border-b border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToChat}
            className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
            title="Kembali ke Chat Utama"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-400">
              <Music className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-xs md:text-sm font-bold text-[var(--foreground)]">
                Stasiun Musik & Suara Ambien
              </h1>
              <span className="text-[10px] text-[var(--muted)]">
                Offline Focus Audio & Soundscape Generator
              </span>
            </div>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center gap-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-1">
          <button
            onClick={() => setActiveTab("ambient")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "ambient"
                ? "bg-emerald-600 text-white shadow-2xs"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            Suara Ambien
          </button>
          <button
            onClick={() => setActiveTab("local")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "local"
                ? "bg-emerald-600 text-white shadow-2xs"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            Lagu Lokal ({scannedTracks.length})
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 max-w-6xl mx-auto w-full">
        {/* Hero Player & Waveform Visualizer */}
        <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-950/30 via-slate-900/40 to-teal-950/30 border border-emerald-500/20 shadow-lg flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-5 w-full md:w-auto">
            {/* Spinning Disc / Cover */}
            <div
              className={`w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-emerald-900/40 border border-emerald-500/30 flex items-center justify-center flex-shrink-0 shadow-md ${
                isPlaying ? "animate-pulse" : ""
              }`}
            >
              <Disc3
                className={`w-10 h-10 md:w-12 md:h-12 text-emerald-400 ${
                  isPlaying ? "animate-spin" : ""
                }`}
                style={{ animationDuration: "6s" }}
              />
            </div>

            {/* Track Details */}
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 text-[10px] font-bold uppercase tracking-wider border border-emerald-500/30">
                  {isPlaying ? "Sedang Diputar" : "Berhenti"}
                </span>
                {isPlaying && (
                  <div className="flex items-center gap-1">
                    <span className="w-1 h-3 bg-emerald-400 animate-pulse" />
                    <span className="w-1 h-4 bg-emerald-400 animate-pulse delay-75" />
                    <span className="w-1 h-2 bg-emerald-400 animate-pulse delay-150" />
                  </div>
                )}
              </div>
              <h2 className="text-base md:text-xl font-bold text-[var(--foreground)] truncate">
                {currentTitle}
              </h2>
              <p className="text-xs text-[var(--muted)] truncate">{currentArtist}</p>
            </div>
          </div>

          {/* Player Controls Bar */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-center md:justify-end">
            <button
              onClick={handlePrev}
              className="p-2.5 rounded-full bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] text-[var(--foreground)] cursor-pointer transition-colors"
              title="Sebelumnya"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              onClick={handleTogglePlay}
              className="p-4 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-md cursor-pointer transition-all transform hover:scale-105"
              title={isPlaying ? "Jeda" : "Putar"}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-white" />}
            </button>

            <button
              onClick={handleNext}
              className="p-2.5 rounded-full bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] text-[var(--foreground)] cursor-pointer transition-colors"
              title="Selanjutnya"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            {/* Volume Control */}
            <div className="flex items-center gap-2 ml-2 pl-3 border-l border-[var(--card-border)]">
              <button
                onClick={handleToggleMute}
                className="text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-16 sm:w-24 accent-emerald-500 cursor-pointer h-1.5 bg-[var(--sidebar-bg)] rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* TAB 1: AMBIENT SOUNDSCAPES */}
        {activeTab === "ambient" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[var(--foreground)]">
                  Preset Suara Ambien & Gelombang Alpha
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  Disintesis langsung di peramban tanpa internet untuk menjaga fokus dan produktivitas maksimal.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {AMBIENT_TRACKS.map((track: AmbientTrack) => {
                const meta = AMBIENT_METADATA[track.synthType] || {
                  emoji: "🎵",
                  gradient: "from-emerald-600 to-teal-950",
                  artist: track.category,
                };
                const isThisPlaying = isPlaying && currentTitle.includes(track.name);

                return (
                  <div
                    key={track.id}
                    onClick={() => handlePlayAmbient(track.id)}
                    className={`group p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isThisPlaying
                        ? "border-emerald-500 bg-emerald-500/15 shadow-md"
                        : "border-[var(--card-border)] bg-[var(--card-bg)] hover:border-emerald-500/40 hover:bg-[var(--sidebar-hover)]"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="text-3xl p-2 rounded-xl bg-black/20">{meta.emoji}</div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-black/30 text-emerald-300 border border-emerald-400/20">
                        {track.category}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <h4 className="text-xs md:text-sm font-bold text-[var(--foreground)] group-hover:text-emerald-400 transition-colors">
                        {track.name}
                      </h4>
                      <p className="text-[11px] text-[var(--muted)]">{meta.artist}</p>
                    </div>

                    <div className="pt-4 flex items-center justify-between">
                      <span className="text-[10px] text-emerald-400 font-mono">
                        {isThisPlaying ? "Sedang Berjalan" : "Klik untuk Putar"}
                      </span>
                      <div
                        className={`p-2 rounded-full ${
                          isThisPlaying
                            ? "bg-emerald-600 text-white"
                            : "bg-[var(--sidebar-bg)] text-[var(--muted)] group-hover:text-emerald-400"
                        }`}
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: LOCAL OFFLINE MUSIC */}
        {activeTab === "local" && (
          <div className="space-y-4">
            {/* Folder Setup & Scan Bar */}
            <div className="p-4 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] flex flex-col sm:flex-row items-center gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--foreground)] flex-shrink-0">
                <FolderOpen className="w-4 h-4 text-emerald-400" />
                <span>Folder Musik Lokal:</span>
              </div>
              <div className="flex-1 w-full flex items-center gap-2">
                <input
                  type="text"
                  value={localDir}
                  onChange={(e) => setLocalDir(e.target.value)}
                  placeholder="Masukkan path folder: C:\Music atau /home/.../Music"
                  className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <button
                  onClick={() => handleScanDirectory()}
                  disabled={isScanning || !localDir.trim()}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer flex-shrink-0"
                >
                  <Folder className="w-3.5 h-3.5" />
                  <span>{isScanning ? "Memindai..." : "Pindai Lagu"}</span>
                </button>
              </div>
            </div>

            {/* Track Search & List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--foreground)]">
                  Daftar Lagu ({filteredLocalTracks.length} lagu)
                </span>
                <div className="relative w-48 sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari lagu..."
                    className="w-full pl-8 pr-3 py-1 text-xs rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {filteredLocalTracks.length === 0 ? (
                <div className="p-8 rounded-2xl border border-dashed border-[var(--card-border)] text-center space-y-2">
                  <Music className="w-8 h-8 text-[var(--muted)]/40 mx-auto" />
                  <p className="text-xs text-[var(--muted)]">
                    {localDir
                      ? "Tidak ditemukan file audio (.mp3, .flac, .wav) pada folder ini."
                      : "Masukkan direktori musik lokal di atas untuk memindai lagu offline."}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--card-border)] rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] overflow-hidden">
                  {filteredLocalTracks.map((track, idx) => (
                    <div
                      key={track.path}
                      onClick={() => handlePlayLocalTrack(track)}
                      className="p-3 flex items-center justify-between hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-[11px] font-mono text-[var(--muted)] w-6 text-center">
                          {idx + 1}
                        </span>
                        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 flex-shrink-0">
                          <Music className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[var(--foreground)] truncate group-hover:text-emerald-400 transition-colors">
                            {track.name}
                          </div>
                          <div className="text-[10px] text-[var(--muted)] truncate">
                            {track.folder || "Root Folder"} • {track.format.toUpperCase()}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-full text-[var(--muted)] group-hover:text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MusicFullView;
