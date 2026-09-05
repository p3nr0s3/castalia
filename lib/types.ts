export type Role = "user" | "assistant" | "system";

export interface GenerationMetrics {
  evalCount?: number;          // Number of generated tokens
  evalDuration?: number;       // Duration in nanoseconds
  evalTps?: number;            // Tokens per second (TPS)
  promptEvalCount?: number;    // Prompt tokens
  promptEvalDuration?: number; // Prompt evaluation in nanoseconds
  promptEvalTps?: number;      // Prompt processing tokens/s
  totalDuration?: number;      // Total duration in nanoseconds
  totalSeconds?: number;       // Total duration in seconds
}

export interface Attachment {
  id: string;
  name: string;
  type: "image" | "document";
  mimeType: string;
  size: number;
  dataUrl?: string; // For images (base64 data URL)
  base64?: string;  // Pure base64 without prefix for Ollama API
  textContent?: string; // For text/code/doc files
}

export interface SearchSource {
  title: string;
  url: string;
  snippet?: string;
  engine?: string;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
  model?: string;
  isError?: boolean;
  attachments?: Attachment[];
  metrics?: GenerationMetrics;
  sources?: SearchSource[];
  reasoning?: string; // Extracted <think> reasoning tokens
}

export type AgentScheduleType = "manual" | "interval" | "daily";

export interface AgentLog {
  id: string;
  agentId: string;
  runAt: number;
  status: "success" | "failed";
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
  model: string;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  webSearch: boolean;
  scheduleType: AgentScheduleType;
  intervalMinutes?: number; // for interval (e.g. 60 for 1h)
  dailyTime?: string;       // "08:00" for daily
  targetProjectId?: string; // optional: save into project
  enabled: boolean;
  status: "idle" | "running" | "completed" | "failed";
  lastRun?: number;
  nextRun?: number;
  runCount: number;
  logs: AgentLog[];
  createdAt: number;
  updatedAt: number;
}

export interface ProjectFile {
  id: string;
  name: string;
  size: number;
  type: string;
  textContent: string;
  uploadedAt: number;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  systemPrompt: string;
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
  agentRole?: string;
  stopSequences?: string[];
  seed?: number;
  files: ProjectFile[];
  createdAt: number;
  updatedAt: number;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  icon?: string;
  systemPrompt: string;
  tools?: string[];
  enabled: boolean;
  isCustom?: boolean;
  tags?: string[];
  author?: string;
  slashCommand?: string;
  downloads?: string;
  category?: "Anthropic" | "Community" | "Partners" | "Custom";
  sourceUrl?: string;
}

export interface MemoryItem {
  id: string;
  category: "preference" | "profile" | "topic";
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

export interface ConnectorItem {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category: "popular" | "community";
  badge?: string;
  installed: boolean;
  endpoint?: string;
  authType?: "none" | "apiKey" | "oauth" | "webhook";
  apiKey?: string;
  webhookUrl?: string;
  repo?: string;
  statusMessage?: string;
  lastTested?: number;
  isLiveConnected?: boolean;
  customHeaders?: Record<string, string>;
}

export interface PluginItem {
  id: string;
  name: string;
  description: string;
  author: string;
  downloads: string;
  icon?: string;
  installed: boolean;
  category?: "Anthropic" | "Partners";
  skillsIncluded?: string[];
  systemPrompt?: string;
}

export interface ArtifactItem {
  id: string;
  title: string;
  type: "code" | "document" | "markdown" | "html" | "report";
  language?: string;
  content: string;
  createdAt: number;
  messageId?: string;
}

export type ThinkingMode = "default" | "think" | "nothink";

export interface Conversation {
  id: string;
  title: string;
  projectId?: string;
  agentId?: string;
  isAgentGenerated?: boolean;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  unread?: boolean;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  numCtx?: number;
  numPredict?: number;
  thinkingMode?: ThinkingMode;
  seed?: number;
  stopSequences?: string[];
  activeSkillIds?: string[];
  messages: Message[];
}

export interface OllamaModelDetails {
  parent_model?: string;
  format?: string;
  family?: string;
  families?: string[];
  parameter_size?: string;
  quantization_level?: string;
}

export interface OllamaModel {
  name: string;
  modified_at?: string;
  size?: number;
  digest?: string;
  details?: OllamaModelDetails;
}

export type ModelProvider =
  | "ollama"
  | "gemini"
  | "openai"
  | "anthropic"
  | "groq"
  | "deepseek"
  | "openrouter"
  | "custom";

export interface ModelOption {
  id: string;
  name: string;
  provider: ModelProvider;
  description?: string;
  badge?: string;
  isLocal?: boolean;
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

export interface PersonaPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  systemPrompt: string;
  temperature?: number;
  topP?: number;
}

export type ThemeType =
  | "dark"
  | "light"
  | "system"
  | "oled"
  | "cyberpunk"
  | "forest"
  | "sunset"
  | "nord"
  | "claude"
  | "dracula"
  | "catppuccin"
  | "tokyo-night"
  | "rose-pine";

export type FontFamilyType =
  | "inter"
  | "jakarta"
  | "geist"
  | "jetbrains"
  | "merriweather"
  | "space"
  | "fira-code"
  | "outfit"
  | "poppins"
  | "lora"
  | "roboto";

export interface AppSettings {
  ollamaUrl: string;
  searxngUrl: string;
  webSearchDefault: boolean;
  defaultModel: string;
  defaultSystemPrompt: string;
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
  apiKeys?: ApiKeysConfig;
  skills?: Skill[];
  memory?: MemoryConfig;
  connectors?: ConnectorItem[];
  plugins?: PluginItem[];
  musicDirectory?: string;
}

export interface ModelPullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  percent?: number;
}

export interface ModelArenaConfig {
  enabled: boolean;
  modelA: string;
  modelB: string;
}

export interface WorkspaceBackupData {
  version: string;
  timestamp: number;
  conversations: Conversation[];
  projects: Project[];
  agents: AgentTask[];
  settings: AppSettings;
  personas: PersonaPreset[];
}
