// Indonesian & Multi-Character Text-to-Speech (TTS) Voice Engine
// Supports Female (Gadis, Siti), Male (Ardi), Cybernetic Robot (PixelBot), and all browser system voices.

export type VoicePresetId = "female_gadis" | "male_ardi" | "robot_pixel" | "female_siti" | "system_custom";

export interface VoicePreset {
  id: VoicePresetId;
  name: string;
  label: string;
  gender: "female" | "male" | "robot" | "neutral";
  icon: string;
  desc: string;
  defaultPitch: number;
  defaultRate: number;
  keywords: string[];
}

export const VOICE_PRESETS: VoicePreset[] = [
  {
    id: "female_gadis",
    name: "Gadis",
    label: "Gadis (Perempuan Ramah)",
    gender: "female",
    icon: "👩",
    desc: "Suara cewek natural, ramah, dan ceria",
    defaultPitch: 1.05,
    defaultRate: 1.05,
    keywords: ["gadis", "siti", "damayanti", "female", "wanita", "perempuan", "id-id", "id"],
  },
  {
    id: "male_ardi",
    name: "Ardi",
    label: "Ardi (Pria Santai)",
    gender: "male",
    icon: "👨",
    desc: "Suara cowok santai, kalem, dan bersahabat",
    defaultPitch: 0.88,
    defaultRate: 1.0,
    keywords: ["ardi", "male", "pria", "laki", "cowok", "id-id", "id"],
  },
  {
    id: "robot_pixel",
    name: "PixelBot",
    label: "PixelBot (Robot AI)",
    gender: "robot",
    icon: "🤖",
    desc: "Karakter robotik retro serasi dengan LED pixel eyes",
    defaultPitch: 1.45,
    defaultRate: 1.15,
    keywords: ["id-id", "id", "google", "microsoft"],
  },
  {
    id: "female_siti",
    name: "Siti",
    label: "Siti (Lembut & Santai)",
    gender: "female",
    icon: "🌸",
    desc: "Suara cewek lembut, santai, dan menenangkan",
    defaultPitch: 1.12,
    defaultRate: 0.95,
    keywords: ["siti", "damayanti", "gadis", "female", "id-id", "id"],
  },
  {
    id: "system_custom",
    name: "Kustom",
    label: "Pilih dari Semua Suara Sistem",
    gender: "neutral",
    icon: "🌐",
    desc: "Gunakan suara terpasang di browser / OS",
    defaultPitch: 1.0,
    defaultRate: 1.0,
    keywords: [],
  },
];

export type ToneMode = "casual" | "warm" | "concise";

export interface ToneOption {
  id: ToneMode;
  label: string;
  icon: string;
  badge: string;
  desc: string;
}

export const TONE_OPTIONS: ToneOption[] = [
  {
    id: "casual",
    label: "Santai & Akrab",
    icon: "🤙",
    badge: "Bestie / Gaul",
    desc: "Bahasa santai sehari-hari (aku-kamu, partikel nih, deh, dong, santai aja)",
  },
  {
    id: "warm",
    label: "Ramah & Hangat",
    icon: "😊",
    badge: "Sopan Santai",
    desc: "Hangat, santun santai, komunikatif, dan bersahabat",
  },
  {
    id: "concise",
    label: "To The Point",
    icon: "⚡",
    badge: "Singkat & Cepat",
    desc: "Langsung inti jawaban tanpa basa-basi (1-2 kalimat)",
  },
];

export interface VoiceConfig {
  presetId: VoicePresetId;
  voiceName?: string;
  pitch: number;
  rate: number;
}

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  presetId: "female_gadis",
  voiceName: "",
  pitch: 1.05,
  rate: 1.05,
};

export interface VoiceSelection {
  voice: SpeechSynthesisVoice | null;
  isFemale: boolean;
  name: string;
}

/**
 * Strips markdown code blocks, tables, URLs, emojis, and markup syntax
 * so the TTS speaks natural conversational Indonesian without reading syntax symbols.
 */
export function cleanTextForSpeech(text: string): string {
  if (!text) return "";

  return text
    // Strip code blocks completely
    .replace(/```[\s\S]*?```/g, "Kode program diabaikan.")
    // Strip inline code
    .replace(/`([^`]+)`/g, "$1")
    // Strip LaTeX math blocks $$ ... $$ and inline $ ... $
    .replace(/\$\$[\s\S]*?\$\$/g, "")
    .replace(/\$([^$]+)\$/g, "$1")
    // Strip action tags [ACTION:...]
    .replace(/\[ACTION:[^\]]+\]/gi, "")
    // Strip markdown links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Strip raw URLs
    .replace(/https?:\/\/\S+/g, "")
    // Strip markdown headings, bold, italic, blockquotes, list markers
    .replace(/^#+\s+/gm, "")
    .replace(/[*_~]{1,3}/g, "")
    .replace(/^>\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    // Strip HTML tags
    .replace(/<[^>]+>/g, "")
    // Strip multiple spaces/newlines
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, ", ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Returns all voices currently installed and loaded in the browser.
 */
export function getAllSystemVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices() || [];
}

/**
 * Returns only Indonesian voices (lang starts with "id" or "id-ID").
 */
/**
 * Calculates a fluency score for voice selection.
 * Voices with "Natural", "Online", "Neural", or "Google" sound significantly more human.
 */
export function getVoiceFluencyScore(name: string): number {
  const lower = name.toLowerCase();
  let score = 0;
  if (lower.includes("natural") || lower.includes("online")) score += 100;
  if (lower.includes("neural")) score += 80;
  if (lower.includes("google")) score += 60;
  if (lower.includes("microsoft")) score += 40;
  if (lower.includes("desktop") || lower.includes("sapi") || lower.includes("espeak")) score -= 50;
  return score;
}

/**
 * Returns only Indonesian voices (lang starts with "id" or "id-ID") sorted by fluency.
 */
export function getIndonesianVoices(): SpeechSynthesisVoice[] {
  const all = getAllSystemVoices();
  return all
    .filter(
      (v) => v.lang.toLowerCase().startsWith("id") || v.lang.toLowerCase() === "id-id"
    )
    .sort((a, b) => getVoiceFluencyScore(b.name) - getVoiceFluencyScore(a.name));
}

/**
 * Resolves the best SpeechSynthesisVoice matching the provided VoiceConfig.
 * Strongly prioritizes Natural Neural voices (Microsoft Natural, Google Neural)
 * over mechanical desktop voices.
 */
export function resolveVoiceForConfig(
  config: VoiceConfig,
  allVoices?: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  const rawVoices = allVoices && allVoices.length > 0 ? allVoices : getAllSystemVoices();
  if (rawVoices.length === 0) return null;

  // 1. If a specific voiceName is specified, find it first
  if (config.voiceName) {
    const matched = rawVoices.find((v) => v.name === config.voiceName);
    if (matched) return matched;
  }

  // Sort candidate voices by fluency score
  const voices = [...rawVoices].sort(
    (a, b) => getVoiceFluencyScore(b.name) - getVoiceFluencyScore(a.name)
  );

  const idVoices = voices.filter(
    (v) => v.lang.toLowerCase().startsWith("id") || v.lang.toLowerCase() === "id-id"
  );

  // 2. Resolve based on presetId
  if (config.presetId === "female_gadis" || config.presetId === "female_siti") {
    const femaleKeywords = ["gadis", "siti", "damayanti", "female", "wanita", "perempuan", "dfz#female"];
    const foundFemale = idVoices.find((v) =>
      femaleKeywords.some((kw) => v.name.toLowerCase().includes(kw))
    );
    if (foundFemale) return foundFemale;
    if (idVoices.length > 0) return idVoices[0];
  } else if (config.presetId === "male_ardi") {
    const maleKeywords = ["ardi", "male", "pria", "laki", "cowok"];
    const foundMale = idVoices.find((v) =>
      maleKeywords.some((kw) => v.name.toLowerCase().includes(kw))
    );
    if (foundMale) return foundMale;
    if (idVoices.length > 0) return idVoices[0];
  } else if (config.presetId === "robot_pixel") {
    if (idVoices.length > 0) return idVoices[0];
  }

  // 3. Fallback: Most fluent Indonesian voice or top fluent system voice
  if (idVoices.length > 0) return idVoices[0];
  return voices.find((v) => getVoiceFluencyScore(v.name) > 0) || voices.find((v) => v.default) || voices[0] || null;
}

/**
 * Universal speech player supporting all presets, pitch, rate, and voice overrides.
 */
export function speakUniversal({
  text,
  voice,
  pitch = 1.0,
  rate = 1.0,
  onStart,
  onEnd,
  onError,
}: {
  text: string;
  voice?: SpeechSynthesisVoice | null;
  pitch?: number;
  rate?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (e: any) => void;
}): SpeechSynthesisUtterance | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    if (onError) onError(new Error("Speech synthesis not supported"));
    return null;
  }

  window.speechSynthesis.cancel();

  const cleaned = cleanTextForSpeech(text);
  if (!cleaned) {
    if (onEnd) onEnd();
    return null;
  }

  const utterance = new SpeechSynthesisUtterance(cleaned);

  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang || "id-ID";
  } else {
    utterance.lang = "id-ID";
  }

  utterance.pitch = Math.max(0.5, Math.min(2.0, pitch));
  utterance.rate = Math.max(0.5, Math.min(2.0, rate));

  if (onStart) utterance.onstart = () => onStart();
  if (onEnd) utterance.onend = () => onEnd();
  if (onError) utterance.onerror = (e) => onError(e);

  window.speechSynthesis.speak(utterance);
  return utterance;
}

let activeAudioElement: HTMLAudioElement | null = null;

export function stopSpeaking(): void {
  if (typeof window !== "undefined") {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (activeAudioElement) {
      try {
        activeAudioElement.pause();
        activeAudioElement.src = "";
      } catch {}
      activeAudioElement = null;
    }
  }
}

/**
 * Speaks text using OpenAI's high-fidelity neural audio API (tts-1).
 * Produces hyper-realistic, fluent speech with human-like breathing and natural prosody.
 */
export async function speakOpenAiTts({
  text,
  apiKey,
  voice = "nova",
  speed = 1.0,
  onStart,
  onEnd,
  onError,
}: {
  text: string;
  apiKey: string;
  voice?: string;
  speed?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (e: any) => void;
}): Promise<HTMLAudioElement | null> {
  if (typeof window === "undefined" || !text.trim() || !apiKey) return null;
  const cleaned = cleanTextForSpeech(text);
  if (!cleaned) return null;

  stopSpeaking();

  try {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: cleaned,
        voice: voice || "nova",
        speed: Math.max(0.75, Math.min(1.5, speed)),
      }),
    });

    if (!res.ok) throw new Error(`OpenAI TTS status ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    activeAudioElement = audio;

    if (onStart) audio.onplay = () => onStart();
    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (activeAudioElement === audio) activeAudioElement = null;
      if (onEnd) onEnd();
    };
    audio.onerror = (e) => {
      URL.revokeObjectURL(url);
      if (activeAudioElement === audio) activeAudioElement = null;
      if (onError) onError(e);
    };

    await audio.play();
    return audio;
  } catch (err) {
    if (onError) onError(err);
    return null;
  }
}

/**
 * Plays a quick voice preview sample so the user can test the selected voice over.
 */
export function previewVoice(
  config: VoiceConfig,
  allVoices?: SpeechSynthesisVoice[],
  sampleText?: string,
  onEnd?: () => void
): SpeechSynthesisUtterance | null {
  const targetVoice = resolveVoiceForConfig(config, allVoices);
  const isIndonesian = targetVoice?.lang.toLowerCase().startsWith("id") ?? true;

  const defaultSample = isIndonesian
    ? config.presetId === "male_ardi"
      ? "Halo bro! Gue Ardi. Siap diajak ngobrol santai kapan aja."
      : config.presetId === "robot_pixel"
      ? "Bip bop! PixelBot online. Siap bantu kamu dengan cepat!"
      : config.presetId === "female_siti"
      ? "Halo... Senang bisa menemani obrolan santai kamu hari ini."
      : "Halo! Senang banget bisa ngobrol santai bareng kamu."
    : "Hello there! I am ready to talk with you.";

  return speakUniversal({
    text: sampleText || defaultSample,
    voice: targetVoice,
    pitch: config.pitch,
    rate: config.rate,
    onEnd,
    onError: onEnd,
  });
}

/**
 * Backward-compatible helper for legacy components.
 */
export function getIndonesianFemaleVoice(): VoiceSelection {
  const idVoices = getIndonesianVoices();
  const femaleKeywords = ["gadis", "siti", "damayanti", "female", "wanita", "perempuan", "dfz#female"];
  for (const v of idVoices) {
    const vName = v.name.toLowerCase();
    if (femaleKeywords.some((kw) => vName.includes(kw))) {
      return { voice: v, isFemale: true, name: v.name };
    }
  }
  if (idVoices.length > 0) {
    return { voice: idVoices[0], isFemale: false, name: idVoices[0].name };
  }
  const all = getAllSystemVoices();
  const defaultVoice = all.find((v) => v.default) || all[0] || null;
  return {
    voice: defaultVoice,
    isFemale: false,
    name: defaultVoice ? defaultVoice.name : "Default System Voice",
  };
}

export function speakIndonesianFemale({
  text,
  voice,
  rate = 1.05,
  pitch = 1.15,
  onStart,
  onEnd,
  onError,
}: {
  text: string;
  voice?: SpeechSynthesisVoice | null;
  rate?: number;
  pitch?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (e: any) => void;
}): SpeechSynthesisUtterance | null {
  const selectedVoiceInfo = voice ? { voice, isFemale: true, name: voice.name } : getIndonesianFemaleVoice();
  return speakUniversal({
    text,
    voice: selectedVoiceInfo.voice,
    pitch: selectedVoiceInfo.isFemale ? 1.05 : pitch,
    rate,
    onStart,
    onEnd,
    onError,
  });
}
