import { AppSettings, PersonaPreset, ModelOption, FontFamilyType } from "./types";
import { DEFAULT_SKILLS } from "./skills";

export const FONT_OPTIONS: { id: FontFamilyType; name: string; fontClass: string; desc: string; sample: string }[] = [
  {
    id: "inter",
    name: "Inter",
    fontClass: "font-sans",
    desc: "Modern crisp UI sans-serif",
    sample: "Aa Bb 123",
  },
  {
    id: "jakarta",
    name: "Plus Jakarta Sans",
    fontClass: "font-['Plus_Jakarta_Sans',sans-serif]",
    desc: "Sleek geometric typography",
    sample: "Aa Bb 123",
  },
  {
    id: "geist",
    name: "Geist Sans",
    fontClass: "font-['Geist',sans-serif]",
    desc: "Clean developer & design aesthetic",
    sample: "Aa Bb 123",
  },
  {
    id: "jetbrains",
    name: "JetBrains Mono",
    fontClass: "font-mono",
    desc: "Developer & coder monospace",
    sample: "const x = 42;",
  },
  {
    id: "merriweather",
    name: "Merriweather",
    fontClass: "font-serif",
    desc: "Elegant editorial reading serif",
    sample: "Aa Bb 123",
  },
  {
    id: "space",
    name: "Space Grotesk",
    fontClass: "font-['Space_Grotesk',sans-serif]",
    desc: "Futuristic tech grotesque",
    sample: "Aa Bb 123",
  },
];

import {
  DEFAULT_DIRECTORY_SKILLS,
  DEFAULT_CONNECTORS,
  DEFAULT_PLUGINS,
  DEFAULT_MEMORY_CONFIG,
} from "./directoryData";

export const DEFAULT_SETTINGS: AppSettings = {
  ollamaUrl: "http://localhost:11434",
  semanticRagEnabled: false,
  embeddingModel: "nomic-embed-text",
  deepScrapeEnabled: true,
  webSearchDefault: false,
  defaultModel: "",
  defaultSystemPrompt: "You are a helpful, respectful, and honest AI assistant.",
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  minP: 0.05,
  repeatPenalty: 1.1,
  numCtx: 16384,
  numPredict: 2048,
  thinkingMode: "default",
  theme: "dark",
  fontFamily: "inter",
  sendOnEnter: true,
  streamResponse: true,
  chatFullWidth: false,
  apiKeys: {
    geminiApiKey: "",
    openaiApiKey: "",
    anthropicApiKey: "",
    groqApiKey: "",
    deepseekApiKey: "",
    openrouterApiKey: "",
    customBaseUrl: "",
    customApiKey: "",
    customModelName: "",
  },
  skills: DEFAULT_DIRECTORY_SKILLS,
  connectors: DEFAULT_CONNECTORS,
  plugins: DEFAULT_PLUGINS,
  memory: DEFAULT_MEMORY_CONFIG,
  smartContextEnabled: true,
  ollamaKeepAlive: "60m",
  customTheme: {
    name: "Custom Palette",
    background: "#12141a",
    foreground: "#f3f4f6",
    sidebarBg: "#0c0e12",
    cardBg: "#1a1d24",
    accent: "#38bdf8",
    muted: "#9ca3af",
  },
  voice: {
    presetId: "female_gadis",
    voiceName: "",
    pitch: 1.05,
    rate: 1.05,
    tone: "casual",
    engine: "natural",
    autoSilenceMs: 1400,
  },
};

export const DEFAULT_CUSTOM_THEME = {
  name: "Custom Palette",
  background: "#12141a",
  foreground: "#f3f4f6",
  sidebarBg: "#0c0e12",
  cardBg: "#1a1d24",
  accent: "#38bdf8",
  muted: "#9ca3af",
};

export interface KeepAlivePreset {
  value: string;
  label: string;
  description: string;
}

export const KEEP_ALIVE_PRESETS: KeepAlivePreset[] = [
  { value: "5m", label: "5 Menit (Default Ollama)", description: "Unload model jika idle 5 menit untuk membebaskan VRAM" },
  { value: "15m", label: "15 Menit", description: "Menjaga model tetap hangat untuk jeda membaca singkat" },
  { value: "30m", label: "30 Menit", description: "Keseimbangan ideal antara penggunaan memori & respons cepat" },
  { value: "60m", label: "1 Jam (Rekomendasi)", description: "Sangat optimal untuk sesi kerja/coding tanpa re-load" },
  { value: "2h", label: "2 Jam", description: "Menjaga model dan KV-cache aktif selama sesi panjang" },
  { value: "24h", label: "24 Jam", description: "Tetap standby seharian penuh untuk workstation lokal" },
  { value: "-1", label: "Permanen di VRAM (-1)", description: "Jangan pernah unload model kecuali aplikasi dimatikan" },
];

export interface ContextPreset {
  value: number;
  label: string;
  name: string;
  desc: string;
  badge: string;
  vramEst: string;
}

export const CONTEXT_SIZE_PRESETS: ContextPreset[] = [
  {
    value: 4096,
    label: "4K",
    name: "4,096 tokens",
    desc: "Cepat & Ringan — Cocok untuk PC dengan VRAM terbatas (4GB - 6GB)",
    badge: "Lightweight",
    vramEst: "~1 GB VRAM",
  },
  {
    value: 8192,
    label: "8K",
    name: "8,192 tokens",
    desc: "Seimbang — Standar percakapan panjang & diskusi multi-turn harian",
    badge: "Balanced",
    vramEst: "~2 GB VRAM",
  },
  {
    value: 16384,
    label: "16K",
    name: "16,384 tokens",
    desc: "Rekomendasi Utama — Sangat optimal untuk RAG, Knowledge Base, & Coding",
    badge: "Recommended",
    vramEst: "~3.5 GB VRAM",
  },
  {
    value: 32768,
    label: "32K",
    name: "32,768 tokens",
    desc: "Proyek Luas — Menganalisis dokumen panjang, PDF tebal, & multi-file coding",
    badge: "Extended",
    vramEst: "~6 GB VRAM",
  },
  {
    value: 65536,
    label: "64K",
    name: "65,536 tokens",
    desc: "Kapasitas Raksasa — Full Codebase repo, transkrip panjang, buku utuh",
    badge: "Massive",
    vramEst: "~10+ GB VRAM",
  },
];

export const CLOUD_MODEL_PRESETS: ModelOption[] = [
  // Google Gemini Models
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "gemini",
    description: "Next-gen ultra-fast multimodal model by Google",
    badge: "Fast & Smart",
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "gemini",
    description: "Google's most capable reasoning and coding model",
    badge: "Pro Reasoning",
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "gemini",
    description: "Real-time multimodal speed powerhouse",
    badge: "Speed",
  },

  // OpenAI Models
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    description: "OpenAI's flagship omni model for text and vision",
    badge: "Flagship",
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    description: "Fast, intelligent, and affordable OpenAI model",
    badge: "Lightweight",
  },
  {
    id: "o3-mini",
    name: "o3-mini (Reasoning)",
    provider: "openai",
    description: "High-speed STEM, Math, and Coding reasoning model",
    badge: "Reasoning",
  },

  // Anthropic Claude Models
  {
    id: "claude-3-7-sonnet-20250219",
    name: "Claude 3.7 Sonnet",
    provider: "anthropic",
    description: "Anthropic's latest hybrid reasoning & instant response model",
    badge: "Thinking",
  },
  {
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    description: "Industry-leading intelligence for coding and analysis",
    badge: "Elite Coding",
  },
  {
    id: "claude-3-5-haiku-20241022",
    name: "Claude 3.5 Haiku",
    provider: "anthropic",
    description: "Ultra-fast lightweight Claude model",
    badge: "Fast",
  },

  // DeepSeek Models
  {
    id: "deepseek-chat",
    name: "DeepSeek-V3",
    provider: "deepseek",
    description: "671B MoE powerhouse with exceptional general knowledge",
    badge: "MoE 671B",
  },
  {
    id: "deepseek-reasoner",
    name: "DeepSeek-R1 (Reasoning)",
    provider: "deepseek",
    description: "Open-weights reasoning breakthrough with full chain-of-thought",
    badge: "CoT Thinker",
  },

  // Groq Ultra-Fast LPU Models
  {
    id: "llama-3.3-70b-versatile",
    name: "Llama 3.3 70B (Groq)",
    provider: "groq",
    description: "Meta's flagship open model running at 300+ tokens/s on Groq LPU",
    badge: "300+ t/s",
  },
  {
    id: "deepseek-r1-distill-llama-70b",
    name: "DeepSeek R1 70B (Groq)",
    provider: "groq",
    description: "DeepSeek reasoning distilled into Llama 70B on Groq",
    badge: "Ultra Fast CoT",
  },
];

export const PRESET_PERSONAS: PersonaPreset[] = [
  {
    id: "teman-santai",
    name: "Teman Santai (Casual ID)",
    description: "Gaya ngobrol santai, luwes, dan akrab berbahasa Indonesia seperti sahabat dekat",
    icon: "Smile",
    systemPrompt: "Kamu adalah teman ngobrol yang asik, santai, dan cerdas dalam Bahasa Indonesia. Bicaralah kasual, luwes, dan bersahabat ('aku - kamu'), gunakan partikel percakapan santai sehari-hari (nih, deh, dong, kan, yuk, aja, santai aja), dan hindari gaya bahasa kaku, birokratis, atau formal. Jawab dengan to the point, komunikatif, dan solutif.",
    temperature: 0.75,
    topP: 0.9,
  },
  {
    id: "helpful-assistant",
    name: "General Assistant",
    description: "Versatile, helpful, and concise answers for all general tasks",
    icon: "Sparkles",
    systemPrompt: "You are a versatile, polite, and highly helpful AI assistant. Provide accurate, clear, and structured answers.",
    temperature: 0.7,
    topP: 0.9,
  },
  {
    id: "code-expert",
    name: "Senior Software Engineer",
    description: "Deep technical insight, clean code snippets, and modern architectural advice",
    icon: "Code2",
    systemPrompt: "You are an elite Staff Software Engineer. Write clean, production-ready, performant, and well-typed code. Always explain reasoning concisely and provide best practices.",
    temperature: 0.2,
    topP: 0.9,
  },
  {
    id: "concise-expert",
    name: "Concise & Direct",
    description: "Zero fluff, directly answers questions in bullet points and crisp explanations",
    icon: "Zap",
    systemPrompt: "Answer directly and concisely with zero fluff or conversational filler. Use bullet points and precise explanations.",
    temperature: 0.3,
    topP: 0.8,
  },
  {
    id: "creative-writer",
    name: "Creative Writer",
    description: "Engaging storytelling, rich vocabulary, and creative exploration",
    icon: "PenTool",
    systemPrompt: "You are a creative writer and storyteller. Use expressive, engaging language, vivid imagery, and thoughtful narrative pacing.",
    temperature: 0.9,
    topP: 0.95,
  },
  {
    id: "reasoning-tutor",
    name: "Socratic Teacher & Math",
    description: "Step-by-step mathematical reasoning and structured educational explanations",
    icon: "GraduationCap",
    systemPrompt: "You are an encouraging academic tutor. Break complex topics down step-by-step. For math and logic, render formulas cleanly with LaTeX notation ($...$ and $$...$$).",
    temperature: 0.4,
    topP: 0.85,
  },
];

export const STARTER_PROMPTS = [
  {
    title: "Write a TypeScript function",
    prompt: "Write a high-performance debounce and throttle utility in TypeScript with full type safety and test examples.",
    icon: "Code2",
  },
  {
    title: "Explain a concept",
    prompt: "Explain how modern Transformer attention mechanisms work using an intuitive analogy and math formulas.",
    icon: "Lightbulb",
  },
  {
    title: "Debug & Optimize Code",
    prompt: "Review this React component for unnecessary re-renders and memory leaks, and show the optimized refactor:",
    icon: "Bug",
  },
  {
    title: "Draft an email or plan",
    prompt: "Create a structured 4-week project roadmap for launching a SaaS web application with weekly milestones.",
    icon: "FileText",
  },
];
