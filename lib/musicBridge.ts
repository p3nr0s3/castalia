// Music Player Bridge & Event Bus
// Connects the AI conversational assistant with the Web UI MusicPlayerWidget

export interface MusicPlayerStatus {
  isPlaying: boolean;
  playerMode: "ambient" | "local";
  currentTrackTitle: string;
  volume: number;
  isMuted: boolean;
  isExpanded: boolean;
  ambientTracks: Array<{ id: string; name: string; category: string }>;
  localTracks: Array<{ id: string; name: string }>;
}

export type MusicActionType =
  | "play"
  | "pause"
  | "toggle"
  | "next"
  | "prev"
  | "open"
  | "close"
  | "set-volume";

export interface MusicActionEvent {
  type: MusicActionType;
  trackId?: string; // e.g. "lofi", "rain", "space", "synth", "nature", "binaural" or local track name
  volume?: number;
}

const DEFAULT_AMBIENT_TRACKS = [
  { id: "lofi", name: "Lofi Coffeehouse Chill", category: "Chillhop" },
  { id: "rain", name: "Midnight Rain & Thunder", category: "Ambient" },
  { id: "space", name: "Deep Space Nebula", category: "Cosmic" },
  { id: "synth", name: "Cyberpunk City Nights", category: "Synthwave" },
  { id: "nature", name: "Forest Stream & Birds", category: "Nature" },
  { id: "binaural", name: "432Hz Deep Focus Alpha", category: "Binaural" },
];

/**
 * Returns current live music player status from window object if available.
 */
export function getLiveMusicStatus(): MusicPlayerStatus {
  if (typeof window !== "undefined" && (window as any).__webui_music_status) {
    return (window as any).__webui_music_status;
  }
  return {
    isPlaying: false,
    playerMode: "ambient",
    currentTrackTitle: "Lofi Coffeehouse Chill",
    volume: 0.7,
    isMuted: false,
    isExpanded: false,
    ambientTracks: DEFAULT_AMBIENT_TRACKS,
    localTracks: [],
  };
}

/**
 * Updates live status in window object and dispatches update event.
 */
export function publishMusicStatus(status: Partial<MusicPlayerStatus>): void {
  if (typeof window === "undefined") return;
  const current = getLiveMusicStatus();
  const updated: MusicPlayerStatus = {
    ...current,
    ...status,
  };
  (window as any).__webui_music_status = updated;
  window.dispatchEvent(new CustomEvent("webui:music:status_change", { detail: updated }));
}

/**
 * Dispatches a music player command to be caught by MusicPlayerWidget.
 */
export function dispatchMusicAction(action: MusicActionEvent): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("webui:music:action", { detail: action }));
}

/**
 * Builds a prompt directive containing live Music Player capabilities and tracks
 * so the AI can intelligently recall, discuss, and command the player.
 */
export function buildMusicPromptDirective(): string {
  const status = getLiveMusicStatus();

  let directive = `\n\n=== LIVE WEB UI MUSIC PLAYER CAPABILITY ===\n`;
  directive += `Status Pemutar Musik Web UI Saat Ini:\n`;
  directive += `- Sedang Berputar: ${status.isPlaying ? `YA (Judul: "${status.currentTrackTitle}")` : "TIDAK (Sedang Jeda/Pause)"}\n`;
  directive += `- Mode: ${status.playerMode === "ambient" ? "Ambient Soundscapes" : "Lagu Lokal (My Songs)"}\n`;
  directive += `- Volume: ${Math.round(status.volume * 100)}%\n`;
  directive += `- Tampilan Widget: ${status.isExpanded ? "Sedang Terbuka (Expanded)" : "Tersimpan di Pojok (Minimized)"}\n\n`;

  directive += `Daftar Track Ambient yang Tersedia di Web UI:\n`;
  status.ambientTracks.forEach((t) => {
    directive += `* "${t.id}": ${t.name} (Kategori: ${t.category})\n`;
  });

  if (status.localTracks && status.localTracks.length > 0) {
    directive += `\nDaftar Lagu Lokal Pengguna:\n`;
    status.localTracks.slice(0, 10).forEach((lt) => {
      directive += `* "${lt.name}"\n`;
    });
  }

  directive += `\nKEMAMPUAN MENGENDALIKAN PEMUTAR MUSIK (MUSIC RECALL & CONTROL):\n`;
  directive += `Kamu terhubung langsung dengan Pemutar Musik di Web UI ini! Bila pengguna meminta memutar musik, menyetel lagu, menjeda, mengganti track, atau membuka pemutar musik, kamu BISA langsung melakukannya.\n`;
  directive += `Sertakan salah satu action tag berikut di awal responmu (sistem akan otomatis mengeksekusinya di Web UI tanpa membaca kodenya ke suara):\n`;
  directive += `- [ACTION:MUSIC_PLAY:lofi] -> Memutar Lofi Coffeehouse Chill (Chillhop santai)\n`;
  directive += `- [ACTION:MUSIC_PLAY:rain] -> Memutar Midnight Rain & Thunder (Suara hujan menenangkan)\n`;
  directive += `- [ACTION:MUSIC_PLAY:space] -> Memutar Deep Space Nebula (Kosmik rileks)\n`;
  directive += `- [ACTION:MUSIC_PLAY:synth] -> Memutar Cyberpunk City Nights (Synthwave retro 80s)\n`;
  directive += `- [ACTION:MUSIC_PLAY:nature] -> Memutar Forest Stream & Birds (Kicau burung alam)\n`;
  directive += `- [ACTION:MUSIC_PLAY:binaural] -> Memutar 432Hz Deep Focus Alpha (Fokus belajar/bekerja)\n`;
  directive += `- [ACTION:MUSIC_PLAY] -> Melanjutkan pemutaran musik yang sedang dijeda\n`;
  directive += `- [ACTION:MUSIC_PAUSE] -> Menjeda / menghentikan (pause/stop) musik\n`;
  directive += `- [ACTION:MUSIC_NEXT] -> Lanjut ke lagu / track berikutnya\n`;
  directive += `- [ACTION:MUSIC_PREV] -> Kembali ke lagu / track sebelumnya\n`;
  directive += `- [ACTION:MUSIC_OPEN] -> Membuka / memunculkan (recall) jendela pemutar musik di layar\n`;
  directive += `- [ACTION:MUSIC_CLOSE] -> Menutup / menyembunyikan jendela pemutar musik\n`;
  directive += `\nContoh respon jika diminta memutar musik: "[ACTION:MUSIC_PLAY:lofi] Siap bro, aku putarin Lofi Chill ya biar suasana ngobrol kita makin asik!"\n`;

  return directive;
}

/**
 * Scans AI response for [ACTION:MUSIC_...] tags, executes the corresponding action,
 * and strips the tag from the user-facing text.
 */
export function executeMusicActionFromResponse(rawText: string): {
  cleanedText: string;
  actionExecuted: string | null;
} {
  if (!rawText) return { cleanedText: rawText, actionExecuted: null };

  const actionRegex = /\[ACTION:MUSIC_([A-Z_]+)(?::([a-zA-Z0-9_\-\s]+))?\]/i;
  const match = actionRegex.exec(rawText);

  if (!match) {
    return { cleanedText: rawText, actionExecuted: null };
  }

  const rawCmd = match[1].toUpperCase();
  const rawParam = match[2] ? match[2].trim() : undefined;
  const fullTag = match[0];
  const cleanedText = rawText.replace(fullTag, "").trim();

  let actionExecuted: string | null = fullTag;

  switch (rawCmd) {
    case "PLAY":
      dispatchMusicAction({ type: "play", trackId: rawParam });
      break;
    case "PAUSE":
    case "STOP":
      dispatchMusicAction({ type: "pause" });
      break;
    case "TOGGLE":
      dispatchMusicAction({ type: "toggle" });
      break;
    case "NEXT":
      dispatchMusicAction({ type: "next" });
      break;
    case "PREV":
    case "PREVIOUS":
      dispatchMusicAction({ type: "prev" });
      break;
    case "OPEN":
    case "RECALL":
    case "SHOW":
      dispatchMusicAction({ type: "open" });
      break;
    case "CLOSE":
    case "HIDE":
      dispatchMusicAction({ type: "close" });
      break;
    default:
      actionExecuted = null;
      break;
  }

  return { cleanedText, actionExecuted };
}
