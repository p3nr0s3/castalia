"use client";

import React, { useState, useEffect, useRef } from "react";
import { apiFetch, withAccessToken } from "../lib/apiClient";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Music,
  ChevronDown,
  Sparkles,
  Folder,
  FolderOpen,
  Upload,
  Shuffle,
  Repeat,
  ListMusic,
  Trash2,
  HardDrive,
  Headphones,
  X,
} from "lucide-react";
import { publishMusicStatus, MusicActionEvent } from "@/lib/musicBridge";

interface AmbientTrack {
  id: string;
  name: string;
  category: string;
  synthType: "lofi" | "rain" | "space" | "synthwave" | "nature" | "binaural";
}

export interface LocalTrack {
  id: string;
  name: string;
  src: string; // Blob URL or /api/audio?path=...
  format?: string;
  duration?: number;
  coverUrl?: string;
  artist?: string;
  isLocalFile?: boolean;
  /** Subfolder path relative to the scanned root, e.g. "Albums/2019". Empty/undefined = root. */
  folder?: string;
}

const AMBIENT_TRACKS: AmbientTrack[] = [
  { id: "lofi", name: "Lofi Coffeehouse Chill", category: "Chillhop", synthType: "lofi" },
  { id: "rain", name: "Midnight Rain & Thunder", category: "Ambient", synthType: "rain" },
  { id: "space", name: "Deep Space Nebula", category: "Cosmic", synthType: "space" },
  { id: "synth", name: "Cyberpunk City Nights", category: "Synthwave", synthType: "synthwave" },
  { id: "nature", name: "Forest Stream & Birds", category: "Nature", synthType: "nature" },
  { id: "binaural", name: "432Hz Deep Focus Alpha", category: "Binaural", synthType: "binaural" },
];

export const AMBIENT_METADATA: Record<string, { emoji: string; gradient: string; artist: string }> = {
  lofi: { emoji: "☕", gradient: "from-amber-600 to-orange-950", artist: "Chillhop Beats" },
  rain: { emoji: "🌧️", gradient: "from-blue-600 to-indigo-950", artist: "Midnight Thunderstorm" },
  space: { emoji: "🌌", gradient: "from-purple-600 to-slate-950", artist: "Deep Space Nebula" },
  synth: { emoji: "🌆", gradient: "from-pink-600 to-purple-950", artist: "Cyberpunk 80s City" },
  nature: { emoji: "🌲", gradient: "from-emerald-600 to-teal-950", artist: "Forest Birds & Stream" },
  binaural: { emoji: "🎧", gradient: "from-cyan-600 to-blue-950", artist: "432Hz Alpha Waves" },
};

export interface NowPlayingInfo {
  isPlaying: boolean;
  title: string;
  artist?: string;
  coverUrl?: string;
  coverEmoji?: string;
  coverGradient?: string;
  playerMode: "local" | "ambient";
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onStop: () => void;
  onOpenPlayer: () => void;
}

interface MusicPlayerWidgetProps {
  musicDirectory?: string;
  onTrackUpdate?: (info: { isPlaying: boolean; title: string; onOpenPlayer: () => void } | null) => void;
}

export const MusicPlayerWidget: React.FC<MusicPlayerWidgetProps> = ({
  musicDirectory,
  onTrackUpdate,
}) => {
  // Mode: "ambient" vs "local"
  const [playerMode, setPlayerMode] = useState<"local" | "ambient">("local");

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [ambientIndex, setAmbientIndex] = useState(0);
  const [localIndex, setLocalIndex] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);

  // Time tracking
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Local playlist
  const [localTracks, setLocalTracks] = useState<LocalTrack[]>([]);
  const [localDirPath, setLocalDirPath] = useState(musicDirectory || "");
  const [isScanningDir, setIsScanningDir] = useState(false);

  // Root container ref for auto-minimizing on click outside
  const widgetRef = useRef<HTMLDivElement>(null);

  // Audio elements & synthesis refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const activeNodesRef = useRef<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Current active track info
  const currentAmbient = AMBIENT_TRACKS[ambientIndex];
  const currentLocal = localTracks[localIndex] || null;
  const currentTrackTitle =
    playerMode === "ambient"
      ? currentAmbient?.name || "Ambient Focus"
      : currentLocal?.name || (localTracks.length > 0 ? "Local Offline Track" : "Offline Music");

  // Notify parent/header about current playing track
  useEffect(() => {
    if (onTrackUpdate) {
      if (isPlaying) {
        onTrackUpdate({
          isPlaying: true,
          title: currentTrackTitle,
          onOpenPlayer: () => setIsExpanded(true),
        });
      } else {
        onTrackUpdate(null);
      }
    }
  }, [isPlaying, currentTrackTitle, onTrackUpdate]);

  // Synchronize live status with global music bridge for AI recall
  useEffect(() => {
    publishMusicStatus({
      isPlaying,
      playerMode,
      currentTrackTitle,
      volume,
      isMuted,
      isExpanded,
      ambientTracks: AMBIENT_TRACKS.map((t) => ({ id: t.id, name: t.name, category: t.category })),
      localTracks: localTracks.map((lt) => ({ id: lt.id, name: lt.name })),
    });
  }, [isPlaying, playerMode, currentTrackTitle, volume, isMuted, isExpanded, localTracks]);

  // Auto-minimize when clicking anywhere outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (isExpanded && widgetRef.current && !widgetRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isExpanded) {
        setIsExpanded(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isExpanded]);

  // Auto-scan configured music directory from settings on initial load or update
  useEffect(() => {
    if (musicDirectory?.trim()) {
      setLocalDirPath(musicDirectory.trim());
      apiFetch(`/api/audio?dir=${encodeURIComponent(musicDirectory.trim())}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.files && Array.isArray(data.files) && data.files.length > 0) {
            const fetched: LocalTrack[] = data.files.map((f: any) => ({
              id: `disk_${f.path}`,
              name: f.name,
              src: withAccessToken(`/api/audio?path=${encodeURIComponent(f.path)}`),
              format: f.format,
              coverUrl: f.coverUrl ? withAccessToken(f.coverUrl) : undefined,
              isLocalFile: true,
              folder: f.folder,
            }));
            setLocalTracks(fetched);
            setPlayerMode("local");
          }
        })
        .catch(() => {});
    }
  }, [musicDirectory]);

  const currentTitle = currentTrackTitle;

  // Stop synthesis nodes
  const stopSynthesis = () => {
    activeNodesRef.current.forEach((node) => {
      try {
        if (node.stop) node.stop();
        node.disconnect();
      } catch (e) {}
    });
    activeNodesRef.current = [];
  };

  // Start sound generator for ambient tracks
  const startSynthesis = (type: AmbientTrack["synthType"]) => {
    stopSynthesis();
    if (audioRef.current) {
      audioRef.current.pause();
    }

    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }

    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") ctx.resume();

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(isMuted ? 0 : volume * 0.4, ctx.currentTime);
    masterGain.connect(ctx.destination);
    gainNodeRef.current = masterGain;

    if (type === "binaural" || type === "space") {
      const freqs = type === "binaural" ? [216, 218, 432] : [110, 164.8, 220, 329.6];
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(f, ctx.currentTime);
        const lfo = ctx.createOscillator();
        lfo.frequency.setValueAtTime(0.1 + idx * 0.05, ctx.currentTime);
        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(0.08, ctx.currentTime);
        lfo.connect(lfoGain.gain);
        oscGain.gain.setValueAtTime(0.12, ctx.currentTime);
        osc.connect(oscGain);
        oscGain.connect(masterGain);
        osc.start();
        lfo.start();
        activeNodesRef.current.push(osc, lfo, oscGain, lfoGain);
      });
    } else if (type === "rain" || type === "nature") {
      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = data[i];
        data[i] *= 3.5;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(type === "rain" ? 650 : 1200, ctx.currentTime);
      noise.connect(filter);
      filter.connect(masterGain);
      noise.start();
      activeNodesRef.current.push(noise, filter);
    } else {
      const baseNotes = type === "lofi" ? [130.81, 164.81, 196.0, 246.94] : [146.83, 174.61, 220.0, 293.66];
      baseNotes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = type === "lofi" ? "triangle" : "sawtooth";
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(800 + i * 150, ctx.currentTime);
        oscGain.gain.setValueAtTime(0.08, ctx.currentTime);
        osc.connect(filter);
        filter.connect(oscGain);
        oscGain.connect(masterGain);
        osc.start();
        activeNodesRef.current.push(osc, filter, oscGain);
      });
    }
  };

  // Play audio file
  const playLocalTrack = (index: number) => {
    if (localTracks.length === 0) return;
    stopSynthesis();
    const track = localTracks[index];
    if (!track) return;

    setLocalIndex(index);
    if (audioRef.current) {
      audioRef.current.src = track.src;
      audioRef.current.volume = isMuted ? 0 : volume;
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => console.warn("Audio playback error:", err));
    }
  };

  // Handle Play/Pause
  const togglePlay = () => {
    if (isPlaying) {
      if (playerMode === "ambient") {
        stopSynthesis();
      } else if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlaying(false);
    } else {
      if (playerMode === "ambient") {
        startSynthesis(currentAmbient.synthType);
        setIsPlaying(true);
      } else {
        if (localTracks.length > 0) {
          playLocalTrack(localIndex);
        } else {
          // If no local songs, auto-switch to ambient
          setPlayerMode("ambient");
          startSynthesis(currentAmbient.synthType);
          setIsPlaying(true);
        }
      }
    }
  };

  // Skip Forward
  const handleNext = () => {
    if (playerMode === "ambient") {
      const nextIdx = (ambientIndex + 1) % AMBIENT_TRACKS.length;
      setAmbientIndex(nextIdx);
      if (isPlaying) startSynthesis(AMBIENT_TRACKS[nextIdx].synthType);
    } else {
      if (localTracks.length === 0) return;
      let nextIdx = localIndex + 1;
      if (isShuffle) {
        nextIdx = Math.floor(Math.random() * localTracks.length);
      } else if (nextIdx >= localTracks.length) {
        nextIdx = 0;
      }
      playLocalTrack(nextIdx);
    }
  };

  // Skip Backward
  const handlePrev = () => {
    if (playerMode === "ambient") {
      const prevIdx = (ambientIndex - 1 + AMBIENT_TRACKS.length) % AMBIENT_TRACKS.length;
      setAmbientIndex(prevIdx);
      if (isPlaying) startSynthesis(AMBIENT_TRACKS[prevIdx].synthType);
    } else {
      if (localTracks.length === 0) return;
      const prevIdx = (localIndex - 1 + localTracks.length) % localTracks.length;
      playLocalTrack(prevIdx);
    }
  };

  // Stop Playback
  const handleStop = () => {
    if (playerMode === "ambient") {
      stopSynthesis();
    } else if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentTime(0);
  };

  // Listen for AI commands dispatched from chat / interactive voice assistant
  useEffect(() => {
    const handleMusicAction = (e: Event) => {
      const customEvent = e as CustomEvent<MusicActionEvent>;
      const action = customEvent.detail;
      if (!action) return;

      switch (action.type) {
        case "play":
          if (action.trackId) {
            const lowerTrackId = action.trackId.toLowerCase().trim();
            // Check ambient tracks
            const ambIdx = AMBIENT_TRACKS.findIndex(
              (t) =>
                t.id.toLowerCase() === lowerTrackId ||
                t.synthType.toLowerCase() === lowerTrackId ||
                t.name.toLowerCase().includes(lowerTrackId) ||
                t.category.toLowerCase().includes(lowerTrackId)
            );
            if (ambIdx >= 0) {
              setPlayerMode("ambient");
              setAmbientIndex(ambIdx);
              startSynthesis(AMBIENT_TRACKS[ambIdx].synthType);
              setIsPlaying(true);
              return;
            }

            // Check local tracks
            const locIdx = localTracks.findIndex((t) =>
              t.name.toLowerCase().includes(lowerTrackId)
            );
            if (locIdx >= 0) {
              setPlayerMode("local");
              playLocalTrack(locIdx);
              return;
            }
          }

          // If no specific track or not found, toggle or resume current
          if (!isPlaying) {
            if (playerMode === "ambient") {
              startSynthesis(currentAmbient.synthType);
              setIsPlaying(true);
            } else if (localTracks.length > 0) {
              playLocalTrack(localIndex);
            } else {
              setPlayerMode("ambient");
              startSynthesis(currentAmbient.synthType);
              setIsPlaying(true);
            }
          }
          break;

        case "pause":
          handleStop();
          break;

        case "toggle":
          togglePlay();
          break;

        case "next":
          handleNext();
          break;

        case "prev":
          handlePrev();
          break;

        case "open":
          setIsExpanded(true);
          break;

        case "close":
          setIsExpanded(false);
          break;

        case "set-volume":
          if (typeof action.volume === "number") {
            const v = Math.max(0, Math.min(1, action.volume));
            setVolume(v);
            if (gainNodeRef.current && audioCtxRef.current) {
              gainNodeRef.current.gain.setValueAtTime(v * 0.4, audioCtxRef.current.currentTime);
            }
            if (audioRef.current) {
              audioRef.current.volume = v;
            }
          }
          break;
      }
    };

    window.addEventListener("webui:music:action", handleMusicAction);
    return () => {
      window.removeEventListener("webui:music:action", handleMusicAction);
    };
  }, [ambientIndex, currentAmbient, isPlaying, localIndex, localTracks, playerMode]);

  // Track Ended Handler
  const handleAudioEnded = () => {
    if (isRepeat) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
    } else {
      handleNext();
    }
  };

  // Handle local files selection via input
  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newTracks: LocalTrack[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith("audio/") || /\.(mp3|wav|flac|ogg|m4a|aac)$/i.test(file.name)) {
        const url = URL.createObjectURL(file);
        const ext = file.name.split(".").pop()?.toUpperCase() || "AUDIO";
        newTracks.push({
          id: `local_${Date.now()}_${i}`,
          name: file.name.replace(/\.[^/.]+$/, ""),
          src: url,
          format: ext,
          isLocalFile: true,
        });
      }
    }

    if (newTracks.length > 0) {
      setLocalTracks((prev) => [...prev, ...newTracks]);
      setPlayerMode("local");
      setLocalIndex(localTracks.length);
      setTimeout(() => playLocalTrack(localTracks.length), 100);
    }
  };

  // Scan local directory on disk via /api/audio?dir=...
  const handleScanLocalDisk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localDirPath.trim()) return;

    setIsScanningDir(true);
    try {
      const res = await apiFetch(`/api/audio?dir=${encodeURIComponent(localDirPath.trim())}`);
      const data = await res.json();

      if (data.files && Array.isArray(data.files)) {
        const fetched: LocalTrack[] = data.files.map((f: any) => ({
          id: `disk_${f.path}`,
          name: f.name,
          src: withAccessToken(`/api/audio?path=${encodeURIComponent(f.path)}`),
          format: f.format,
          coverUrl: f.coverUrl ? withAccessToken(f.coverUrl) : undefined,
          isLocalFile: true,
          folder: f.folder,
        }));

        if (fetched.length > 0) {
          setLocalTracks((prev) => [...prev, ...fetched]);
          setPlayerMode("local");
          setLocalIndex(0);
          playLocalTrack(0);
        } else {
          alert("No audio files (.mp3, .flac, .wav, .m4a) found in that directory.");
        }
      } else {
        alert(data.error || "Could not read directory.");
      }
    } catch (err: any) {
      alert(`Failed to scan folder: ${err.message}`);
    } finally {
      setIsScanningDir(false);
    }
  };

  const removeTrack = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = localTracks.filter((t) => t.id !== id);
    setLocalTracks(updated);
    if (updated.length === 0) {
      if (audioRef.current) audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  // Seek bar handler
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  // Sync volume with audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
    if (gainNodeRef.current && audioCtxRef.current) {
      gainNodeRef.current.gain.setTargetAtTime(
        isMuted ? 0 : volume * 0.4,
        audioCtxRef.current.currentTime,
        0.05
      );
    }
  }, [volume, isMuted]);

  // Format time mm:ss
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return "00:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div ref={widgetRef} className="fixed bottom-40 sm:bottom-44 right-5 sm:right-7 z-40 select-none">
      {/* Hidden HTML5 Audio Element for Local MP3/FLAC/WAV streaming */}
      <audio
        ref={audioRef}
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
            setDuration(audioRef.current.duration || 0);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            setDuration(audioRef.current.duration || 0);
          }
        }}
        onEnded={handleAudioEnded}
      />

      {/* Floating Action Button (Circle FAB for Music Player - Stacked above New Chat) */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-12 h-12 rounded-full flex items-center justify-center border shadow-2xl transition-all active:scale-90 hover:scale-105 cursor-pointer ${
          isPlaying
            ? "bg-purple-600 border-purple-400/50 text-white shadow-purple-600/40 ring-2 ring-purple-500/30"
            : "bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border-[var(--card-border)] text-[var(--foreground)]"
        }`}
        title="Offline Music Player & Ambient Audio"
      >
        {isPlaying ? (
          <div className="flex items-end gap-0.5 h-4 w-4">
            <span className="w-0.5 h-4 bg-white rounded-full animate-pulse" />
            <span className="w-0.5 h-2.5 bg-purple-200 rounded-full animate-pulse delay-75" />
            <span className="w-0.5 h-4 bg-white rounded-full animate-pulse delay-150" />
          </div>
        ) : (
          <Music className="w-5 h-5 text-[var(--foreground)]" />
        )}
      </button>

      {/* Expanded Audio Studio Popover Floating Left/Above the Button (Mobile Responsive) */}
      {isExpanded && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed sm:absolute inset-x-3 bottom-20 sm:inset-x-auto sm:bottom-0 sm:right-16 w-auto sm:w-96 max-w-sm p-4 rounded-3xl bg-[var(--card-bg)]/95 backdrop-blur-2xl border border-[var(--card-border)] shadow-2xl z-50 space-y-3.5 animate-in slide-in-from-bottom-2 sm:slide-in-from-right-2 zoom-in-95 duration-150"
        >
          {/* Header & Mode Switcher */}
          <div className="flex border-b border-[var(--sidebar-border)] pb-2.5 items-center justify-between">
            <div className="flex bg-[var(--sidebar-bg)] p-0.5 rounded-xl border border-[var(--card-border)]/60 text-xs">
              <button
                onClick={() => setPlayerMode("local")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  playerMode === "local"
                    ? "bg-[var(--card-bg)] text-emerald-400 shadow-2xs"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <Folder className="w-3.5 h-3.5" />
                <span>My Songs ({localTracks.length})</span>
              </button>
              <button
                onClick={() => setPlayerMode("ambient")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  playerMode === "ambient"
                    ? "bg-[var(--card-bg)] text-purple-400 shadow-2xs"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <Headphones className="w-3.5 h-3.5" />
                <span>Focus Ambient</span>
              </button>
            </div>

            <button
              onClick={() => setIsExpanded(false)}
              className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Current Song Banner & Seek Bar */}
          <div className="p-3 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)]/60 space-y-2">
            <div className="flex items-center justify-between">
              <div className="min-w-0 pr-2">
                <div className="text-xs font-bold text-[var(--foreground)] truncate">{currentTitle}</div>
                <div className="text-[10px] text-[var(--muted)] truncate">
                  {playerMode === "local"
                    ? currentLocal
                      ? `Local Audio • ${currentLocal.format || "MP3"}`
                      : "No tracks loaded"
                    : `${currentAmbient.category} • Ambient Synthesizer`}
                </div>
              </div>
              <button
                onClick={togglePlay}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-white shadow-md transition-all active:scale-90 cursor-pointer ${
                  isPlaying ? "bg-emerald-500" : "bg-blue-600"
                }`}
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                )}
              </button>
            </div>

            {/* Scrub / Seek Progress Bar */}
            {playerMode === "local" && duration > 0 && (
              <div className="space-y-1 pt-1">
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-full accent-emerald-500 h-1.5 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-[var(--muted)]">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
            )}
          </div>

          {/* TAB 1: LOCAL MUSIC DIRECTORY & PLAYLIST */}
          {playerMode === "local" && (
            <div className="space-y-2.5 animate-in fade-in duration-150">
              {/* Import Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-1.5 p-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] text-xs font-semibold text-[var(--foreground)] transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-blue-400" />
                  <span>Choose Songs</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="audio/*,.mp3,.wav,.flac,.ogg,.m4a,.aac,.webm"
                  onChange={(e) => handleFilesSelected(e.target.files)}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  className="flex items-center justify-center gap-1.5 p-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] text-xs font-semibold text-[var(--foreground)] transition-colors cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Select Folder</span>
                </button>
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  {...({ webkitdirectory: "", directory: "" } as any)}
                  onChange={(e) => handleFilesSelected(e.target.files)}
                  className="hidden"
                />
              </div>

              {/* Direct Path Input Form */}
              <form onSubmit={handleScanLocalDisk} className="flex gap-1.5">
                <input
                  type="text"
                  value={localDirPath}
                  onChange={(e) => setLocalDirPath(e.target.value)}
                  placeholder="Or enter path: C:\Music or /Users/.../Songs"
                  className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--sidebar-bg)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-[11px]"
                />
                <button
                  type="submit"
                  disabled={isScanningDir || !localDirPath.trim()}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>Scan</span>
                </button>
              </form>

              {/* Local Playlist List */}
              <div className="max-h-40 overflow-y-auto space-y-1 pr-1 touch-scroll">
                {localTracks.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[var(--muted)] space-y-1">
                    <ListMusic className="w-6 h-6 text-[var(--muted)]/50 mx-auto" />
                    <p>No offline songs loaded yet.</p>
                    <p className="text-[10px]">Click <strong>Choose Songs</strong> or configure in Settings.</p>
                  </div>
                ) : (
                  localTracks.map((track, idx) => {
                    const isSelected = idx === localIndex;
                    return (
                      <div
                        key={track.id}
                        onClick={() => playLocalTrack(idx)}
                        className={`group flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs cursor-pointer transition-all ${
                          isSelected
                            ? "bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/30"
                            : "bg-[var(--sidebar-bg)] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <span className="font-mono text-[10px] opacity-60 w-4">{idx + 1}</span>
                          <span className="truncate">{track.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {track.format && (
                            <span className="text-[9px] font-mono px-1 py-0.1 rounded bg-[var(--card-bg)] text-[var(--muted)]">
                              {track.format}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => removeTrack(track.id, e)}
                            className="p-0.5 text-[var(--muted)] hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 2: AMBIENT FOCUS SOUNDSCAPES */}
          {playerMode === "ambient" && (
            <div className="grid grid-cols-2 gap-1.5 animate-in fade-in duration-150">
              {AMBIENT_TRACKS.map((t, idx) => {
                const isSelected = idx === ambientIndex;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setAmbientIndex(idx);
                      if (isPlaying) startSynthesis(t.synthType);
                    }}
                    className={`p-2.5 rounded-xl text-left text-xs border transition-all cursor-pointer truncate ${
                      isSelected
                        ? "border-purple-500 bg-purple-500/15 text-purple-400 font-semibold shadow-2xs"
                        : "border-[var(--card-border)] bg-[var(--sidebar-bg)] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                    }`}
                  >
                    <div className="truncate font-medium">{t.name}</div>
                    <div className="text-[10px] opacity-60 mt-0.5">{t.category}</div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Transport Controls & Volume Slider */}
          <div className="pt-2.5 border-t border-[var(--sidebar-border)] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                {playerMode === "local" && (
                  <button
                    onClick={() => setIsShuffle(!isShuffle)}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      isShuffle ? "text-emerald-400 bg-emerald-500/15" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                    title={isShuffle ? "Shuffle ON" : "Shuffle OFF"}
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  onClick={handlePrev}
                  className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                  title="Previous song"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <button
                  onClick={handleNext}
                  className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                  title="Next song"
                >
                  <SkipForward className="w-4 h-4" />
                </button>

                {playerMode === "local" && (
                  <button
                    onClick={() => setIsRepeat(!isRepeat)}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      isRepeat ? "text-emerald-400 bg-emerald-500/15" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                    title={isRepeat ? "Repeat 1 Song ON" : "Repeat OFF"}
                  >
                    <Repeat className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Volume Slider */}
              <div className="flex items-center gap-2 flex-1 max-w-[130px] pl-2">
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    setVolume(parseFloat(e.target.value));
                    if (isMuted) setIsMuted(false);
                  }}
                  className="w-full accent-emerald-500 h-1.5 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
