// lib/types.ts
//
// Direkonstruksi ulang Sept 2026 setelah file ini kehilangan seluruh tipe inti
// (Message/Conversation/AppSettings dst hilang, hanya menyisakan tipe tool).
// Bentuk tiap interface diturunkan dari cara field-nya benar-benar dipakai di
// app/page.tsx, lib/*.ts, dan components/*.tsx per Sept 2026 — bukan tebakan.

import { ToolName } from "./tools";

// ============================================================================
// MODEL / PROVIDER
// ============================================================================

export type ModelProvider =
  | "ollama"
  | "gemini"
  | "openai"
  | "anthropic"
  | "groq"
  | "deepseek"
  | "openrouter"
  | "custom";

export interface OllamaModelDetails {
  format?: string;
  family?: string;
  families?: string[];
  parameter_size?: string;
  quantization_level?: string;
}

export interface OllamaModel {
  name: string;
  model?: string;
  modified_at?: string;
  size?: number;
  digest?: string;
  details?: OllamaModelDetails;
}

export interface ModelOption {
  id: string;
  name: string;
  provider: ModelProvider;
  description?: string;
  badge?: string;
}

export interface ApiKeysConfig {
  geminiApiKey?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  groqApiKey?: string;
  deepseekApiKey?: string;
  openrouterApiKey?: string;
  customBaseUrl?: string;
  customApiKey?: string;
  customModelName?: string;
}

export interface ModelPullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  percent?: number;
}

export interface GenerationMetrics {
  evalCount?: number;
  evalDuration?: number;
  evalTps?: number;
  promptEvalCount?: number;
  promptEvalDuration?: number;
  promptEvalTps?: number;
  totalDuration?: number;
  totalSeconds?: number;
}

// ============================================================================
// CHAT / MESSAGE
// ============================================================================

export type MessageRole = "user" | "assistant" | "system";

export interface Attachment {
  id: string;
  name: string;
  type: "image" | "document";
  mimeType?: string;
  size: number;
  /** Base64 data URL, dipakai untuk attachment bertipe image. */
  dataUrl?: string;
  /** Base64 mentah tanpa prefix data URL, dipakai saat mengirim ke provider cloud (mis. Gemini/OpenAI vision). */
  base64?: string;
  /** Isi teks yang sudah diekstrak, dipakai untuk attachment bertipe document. */
  textContent?: string;
}

export interface SearchSource {
  title: string;
  url: string;
  snippet: string;
  deepContent?: string;
  engine?: string;
  scraped?: boolean;
}

/** Satu eksekusi disk tool yang ditempel ke sebuah pesan assistant untuk ditampilkan di UI. */
export interface ToolCallExecution {
  id: string;
  toolName: ToolName;
  args: Record<string, any>;
  status: "running" | "success" | "error" | "awaiting_approval";
  result?: any;
  error?: string;
  timestamp: number;
  /** Diisi kalau status "awaiting_approval" — id record di pendingApprovals yang menunggu keputusan user. */
  approvalId?: string;
  /** Diisi kalau toolName "write_file" dan status "awaiting_approval" — isi file sebelum ditimpa, buat diff preview. */
  previousContent?: string;
}

export interface RetrievedChunkInfo {
  id: string;
  fileName: string;
  chunkIndex: number;
  totalChunks: number;
  score?: number;
  textSnippet: string;
  estimatedTokens: number;
}

export interface SearchStepInfo {
  step: "searching" | "scraping" | "done";
  query?: string;
  sourceCount?: number;
  scrapedCount?: number;
  scrapedDomains?: string[];
}

export type OwaspSeverity = "critical" | "high" | "medium" | "low" | "info";
export type OwaspCategory =
  | "A01:2021-Broken Access Control"
  | "A02:2021-Cryptographic Failures"
  | "A05:2021-Security Misconfiguration"
  | "A06:2021-Vulnerable and Outdated Components"
  | "A07:2021-Identification and Authentication Failures"
  | "A08:2021-Software and Data Integrity Failures";

export interface OwaspFinding {
  id: string;
  category: OwaspCategory;
  title: string;
  severity: OwaspSeverity;
  status: "pass" | "warn" | "fail";
  description: string;
  evidence?: string;
  recommendation: string;
  cwe?: string;
}

export interface OwaspHeaderSummary {
  csp: boolean;
  hsts: boolean;
  xFrameOptions: boolean;
  xContentTypeOptions: boolean;
  referrerPolicy: boolean;
  permissionsPolicy: boolean;
  corsWildcard: boolean;
  serverBannerExposed?: string;
}

export interface OwaspScanResult {
  targetUrl: string;
  scannedAt: number;
  score: number; // 0 - 100
  grade: "A+" | "A" | "B" | "C" | "D" | "F";
  headersSummary: OwaspHeaderSummary;
  cookiesSummary: {
    total: number;
    missingHttpOnly: number;
    missingSecure: number;
    missingSameSite: number;
  };
  securityTxtPresent: boolean;
  robotsTxtPresent: boolean;
  techDetected: string[];
  findings: OwaspFinding[];
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  model?: string;
  attachments?: Attachment[];
  sources?: SearchSource[];
  searchSteps?: SearchStepInfo;
  owaspScan?: OwaspScanResult;
  metrics?: GenerationMetrics;
  reasoning?: string;
  isError?: boolean;
  toolExecutions?: ToolCallExecution[];
  retrievedChunks?: RetrievedChunkInfo[];
}

// ============================================================================
// CONVERSATION / PROJECT
// ============================================================================

export type ThinkingMode = "default" | "think" | "nothink";

export interface ProjectFile {
  id: string;
  name: string;
  size: number;
  type: "image" | "document";
  mimeType?: string;
  textContent?: string;
  uploadedAt: number;
  /** Present only for files synced in by the ambient file-watcher (see
   * Project.watchedFolderPath) — the path relative to the watched folder
   * root, used to match filesystem events back to this file and to know
   * which files are watcher-owned vs manually uploaded. Manually uploaded
   * files never have this field. */
  watchedRelativePath?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  color?: string;
  systemPrompt?: string;
  defaultModel?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  numCtx?: number;
  numPredict?: number;
  repeatPenalty?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  thinkingMode?: ThinkingMode;
  seed?: number;
  stopSequences?: string[];
  files: ProjectFile[];
  memories?: MemoryItem[];
  /** RAG retrieval tuning — all optional, all fall back to lib/rag.ts's
   * existing defaults when unset. Chunk size/overlap are in characters
   * (not tokens) to match chunkDocument()'s existing unit. semanticWeight
   * + keywordWeight should sum to 1 but aren't enforced to at the type
   * level — rankChunksHybrid clamps/normalizes defensively. */
  ragChunkSizeChars?: number;
  ragChunkOverlapChars?: number;
  ragTopK?: number;
  ragSemanticWeight?: number;
  /** Ambient file-watcher indexing (server-side, opt-in per project).
   * Path is resolved and sandboxed relative to the server's home directory
   * the same way disk tools are (see lib/pathSandbox.ts) — never an
   * absolute filesystem root. When set, the server watches this folder and
   * keeps `files` synced with its plain-text contents automatically;
   * manually uploaded files (via the Knowledge tab's Upload button) are
   * left untouched and continue to coexist alongside watched ones. */
  watchedFolderPath?: string;
  watchedFolderEnabled?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  projectId?: string | null;
  agentId?: string;
  isAgentGenerated?: boolean;
  createdAt: number;
  updatedAt: number;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  numCtx?: number;
  numPredict?: number;
  repeatPenalty?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  thinkingMode?: ThinkingMode;
  seed?: number;
  stopSequences?: string[];
  /** true kalau disk tools aktif untuk sesi chat ini. */
  diskToolsActive?: boolean;
  pinned?: boolean;
  unread?: boolean;
  activeSkillIds?: string[];
  messages: Message[];
}

// ============================================================================
// AGENTS
// ============================================================================

export type AgentScheduleType = "interval" | "daily" | "manual";
export type AgentStatus = "idle" | "running" | "completed" | "error" | "failed" | "awaiting_approval";

export interface AgentLog {
  id: string;
  agentId: string;
  runAt: number;
  status: "success" | "error" | "failed";
  summary: string;
  conversationId?: string;
  tokensGenerated?: number;
  durationSeconds?: number;
  error?: string;
}

export interface AgentTask {
  id: string;
  name: string;
  description?: string;
  prompt: string;
  systemPrompt?: string;
  model: string;
  temperature?: number;
  topP?: number;
  webSearch?: boolean;
  /** Kalau true, agent boleh pakai disk tools (read otomatis, write/delete via approval). Default false. */
  diskToolsActive?: boolean;
  scheduleType: AgentScheduleType;
  intervalMinutes?: number;
  dailyTime?: string;
  targetProjectId?: string;
  enabled: boolean;
  status: AgentStatus;
  lastRun?: number;
  nextRun?: number;
  runCount: number;
  logs: AgentLog[];
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// AGENT TOOL APPROVAL QUEUE
// ============================================================================
// Read-only disk tools (list_directory, read_file, search_files) dieksekusi
// otomatis oleh agent. Tool yang mengubah state (write_file, delete_file)
// selalu masuk ke sini dulu dan menunggu keputusan manual user sebelum
// benar-benar dijalankan — generation agent di-pause sampai keputusan dibuat.

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface PendingApproval {
  id: string;
  /** "agent" untuk run Autonomous Agent, "chat" untuk toggle Disk Tools di chat manual. */
  source: "agent" | "chat";
  agentId?: string;
  agentName?: string;
  conversationId?: string;
  toolName: ToolName;
  args: Record<string, any>;
  status: ApprovalStatus;
  createdAt: number;
  resolvedAt?: number;
  /** Hasil eksekusi setelah di-approve, atau alasan penolakan. Diisi setelah resolve. */
  result?: any;
  error?: string;
  /**
   * Untuk toolName "write_file" saja: isi file SEBELUM ditimpa, dibaca saat approval
   * dibuat (bukan saat di-approve — supaya diff yang ditampilkan ke user akurat
   * mencerminkan apa yang bakal berubah, bukan state file yang mungkin sudah beda
   * lagi pas mereka klik approve). `undefined` berarti file belum ada (file baru).
   */
  previousContent?: string;
}

// ============================================================================
// SKILLS / CONNECTORS / PLUGINS / MEMORY
// ============================================================================

export interface Skill {
  id: string;
  name: string;
  description: string;
  icon?: string;
  systemPrompt: string;
  tags: string[];
  enabled: boolean;
  isCustom?: boolean;
  /** Perintah slash yang memicu skill ini, mis. "/code". */
  slashCommand?: string;
  category?: string;
  author?: string;
  downloads?: string;
  sourceUrl?: string;
  /**
   * When true, activating this skill also turns on the disk tools
   * (list_directory/read_file/write_file/search_files/delete_file) for
   * that conversation — so a skill that claims to write code, analyze
   * files, etc. actually has the capability, instead of just a system
   * prompt asking the model to act like it does.
   */
  enablesDiskTools?: boolean;
}

export type ConnectorCategory = "popular" | "productivity" | "dev" | "other";
export type ConnectorAuthType = "webhook" | "apiKey" | "oauth" | "none";

export interface ConnectorItem {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  badge?: string;
  installed: boolean;
  authType?: ConnectorAuthType;
  webhookUrl?: string;
  apiKey?: string;
  repo?: string;
  endpoint?: string;
  isLiveConnected?: boolean;
  statusMessage?: string;
}

export interface PluginItem {
  id: string;
  name: string;
  description: string;
  author: string;
  downloads: string;
  installed: boolean;
  category: string;
  skillsIncluded: string[];
  systemPrompt?: string;
}

export type MemoryItemCategory = "preference" | "profile" | "project" | "topic" | "other";

export interface MemoryItem {
  id: string;
  category: MemoryItemCategory;
  title: string;
  content: string;
  updatedAt: number;
  enabled: boolean;
}

export interface MemoryConfig {
  generateFromChats: boolean;
  includeSensitive: boolean;
  items: MemoryItem[];
}

// ============================================================================
// ARTIFACTS
// ============================================================================

export interface ArtifactItem {
  id: string;
  title: string;
  type: "code" | "html";
  language: string;
  content: string;
  createdAt: number;
  messageId: string;
}

// ============================================================================
// SETTINGS / PERSONAS / THEME
// ============================================================================

export type ThemeType =
  | "light"
  | "dark"
  | "system"
  | "claude"
  | "oled"
  | "dracula"
  | "catppuccin"
  | "tokyo-night"
  | "rose-pine"
  | "cyberpunk"
  | "forest"
  | "sunset"
  | "nord"
  | "custom";

export interface CustomThemePalette {
  name?: string;
  background: string;
  foreground: string;
  sidebarBg: string;
  cardBg: string;
  accent: string;
  muted?: string;
}

export type FontFamilyType =
  | "inter"
  | "jakarta"
  | "geist"
  | "jetbrains"
  | "merriweather"
  | "space"
  | "outfit"
  | "poppins"
  | "roboto"
  | "fira-code"
  | "lora";

export interface PersonaPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  systemPrompt: string;
  temperature?: number;
  topP?: number;
}

export type VoicePresetId = "female_gadis" | "male_ardi" | "robot_pixel" | "female_siti" | "system_custom";
export type ToneMode = "casual" | "warm" | "concise";

export interface VoiceSettingsConfig {
  presetId: VoicePresetId;
  voiceName?: string;
  pitch: number;
  rate: number;
  tone: ToneMode;
  engine: "natural" | "browser" | "openai";
  autoSilenceMs: number;
  openaiVoice?: string;
}

export interface AppSettings {
  ollamaUrl: string;
  deepScrapeEnabled?: boolean;
  webSearchDefault: boolean;
  defaultModel: string;
  defaultSystemPrompt: string;
  /**
   * When true, project-knowledge retrieval blends BM25 keyword scoring with
   * cosine similarity over embeddings from a local Ollama embedding model
   * (see lib/embeddings.ts, lib/rag.ts:rankChunksHybrid). Off by default —
   * requires an embedding model to be pulled in Ollama
   * (e.g. `ollama pull nomic-embed-text`) and falls back to pure BM25
   * automatically if the embedding call fails for any reason.
   */
  semanticRagEnabled?: boolean;
  embeddingModel?: string;
  temperature: number;
  topP: number;
  topK: number;
  repeatPenalty: number;
  numCtx: number;
  numPredict: number;
  thinkingMode: ThinkingMode;
  theme: ThemeType;
  fontFamily: FontFamilyType;
  sendOnEnter: boolean;
  streamResponse: boolean;
  /**
   * When true (default), the chat message list and composer stretch to the
   * full width of the window instead of being capped to a centered ~896px
   * reading column. Off = the narrower "compact" column some people prefer
   * for long-form reading.
   */
  chatFullWidth?: boolean;
  apiKeys: ApiKeysConfig;
  skills: Skill[];
  connectors: ConnectorItem[];
  plugins: PluginItem[];
  memory: MemoryConfig;
  /**
   * When true, preserves static system prompt prefix in VRAM and injects
   * per-turn RAG chunks/search context into the active user message block.
   * Enables 100% KV cache reuse on preceding turns in Ollama.
   */
  smartContextEnabled?: boolean;
  /**
   * Keep-alive duration for models in Ollama VRAM/RAM (e.g. "30m", "60m", "24h", "-1" for indefinite).
   * Prevents model unloading and KV-cache flushing during pauses in chat.
   */
  ollamaKeepAlive?: string;
  customTheme?: CustomThemePalette;
  voice?: VoiceSettingsConfig;
}

// ============================================================================
// NOTION-STYLE WORKSPACE JOURNAL & NOTEBOOK
// ============================================================================

export type JournalCategory = "daily" | "task" | "idea" | "project" | "quick";
export type JournalStatus = "draft" | "in_progress" | "done" | "archived";
export type JournalPriority = "low" | "medium" | "high" | "urgent";

export interface JournalChecklistItem {
  id: string;
  title: string;
  completed: boolean;
}

export interface JournalEntry {
  id: string;
  title: string;
  content: string;
  icon?: string;
  coverGradient?: string;
  category: JournalCategory;
  status: JournalStatus;
  priority?: JournalPriority;
  projectId?: string;
  tags: string[];
  checklists?: JournalChecklistItem[];
  date?: string;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// TOOL CALLING (disk tools: read_file, write_file, list_directory, search_files)
// ============================================================================
// Catatan: bentuk hasil eksekusi tool (ToolCallResult, ToolExecutionError) sudah
// didefinisikan di lib/toolEngine.ts supaya menempel langsung ke kontrak nyata
// app/api/tools/execute/route.ts. Tipe di sini hanya re-export ToolName supaya
// pemanggil yang cuma butuh nama tool tidak perlu import dari lib/tools.ts.

export type { ToolName } from "./tools";
