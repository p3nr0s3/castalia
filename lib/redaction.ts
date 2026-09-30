/**
 * Redacts high-confidence sensitive patterns from text before it leaves this
 * app toward a cloud AI provider (Gemini, OpenAI, Claude, DeepSeek, etc).
 *
 * Scope is intentionally narrow: only patterns with low false-positive risk
 * are masked. Loose patterns (e.g. "any 12-digit number looks like a card")
 * do more harm than good for a security-analyst workflow where logs and
 * configs get pasted often — over-redaction breaks legitimate analysis.
 *
 * Also masked: API keys of the providers this app supports, JWTs, quoted
 * `password:`/`api_key=` style assignments, and .env-style secret lines.
 *
 * Deliberately NOT redacted: email addresses (too common as legitimate
 * analysis subjects — reporters, phishing targets, tickets) and public IPs
 * (often the actual subject of a security discussion, e.g. IOC lookups).
 *
 * This never blocks a send — it silently masks matches and lets the request
 * continue, per user preference. It only ever runs on the path to a cloud
 * provider; local Ollama requests are untouched.
 */

interface RedactionRule {
  label: string;
  pattern: RegExp;
  /** Keep the key visible (helps the model understand the config) and mask only the value. */
  keepPrefix?: boolean;
}

const RULES: RedactionRule[] = [
  // Private key / certificate blocks (PEM format) — always high-confidence.
  {
    label: "PRIVATE_KEY",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    label: "SSH_PRIVATE_KEY",
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/g,
  },

  // Cloud provider credentials with distinctive, unambiguous prefixes.
  { label: "AWS_ACCESS_KEY", pattern: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { label: "GITHUB_TOKEN", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g },
  { label: "SLACK_TOKEN", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,72}\b/g },
  { label: "GOOGLE_API_KEY", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { label: "STRIPE_KEY", pattern: /\b(sk|pk|rk)_(live|test)_[0-9A-Za-z]{16,99}\b/g },

  // API keys of the providers this app itself can talk to (OpenAI, Anthropic,
  // Groq, OpenRouter, DeepSeek, Hugging Face, ...). These are the secrets a
  // user is MOST likely to paste into a chat or keep in a project file, and
  // all have distinctive prefixes. Order matters: specific prefixes first so
  // the generic `sk-` rule doesn't mislabel them.
  { label: "ANTHROPIC_API_KEY", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { label: "OPENROUTER_API_KEY", pattern: /\bsk-or-v1-[A-Za-z0-9]{32,}\b/g },
  { label: "OPENAI_API_KEY", pattern: /\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}\b/g },
  { label: "GROQ_API_KEY", pattern: /\bgsk_[A-Za-z0-9]{40,}\b/g },
  { label: "HUGGINGFACE_TOKEN", pattern: /\bhf_[A-Za-z0-9]{30,}\b/g },
  { label: "NPM_TOKEN", pattern: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { label: "GITLAB_TOKEN", pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/g },
  // Legacy OpenAI / DeepSeek style: "sk-" + a long alphanumeric run.
  { label: "SK_API_KEY", pattern: /\bsk-[A-Za-z0-9]{32,}\b/g },

  // JSON Web Tokens (three base64url segments, header always starts "eyJ").
  { label: "JWT", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },

  // Quoted secret assignments in code/JSON/YAML: password: "hunter2hunter2".
  // Quoted-only (and >= 8 chars) keeps `password: string` type annotations and
  // prose untouched.
  {
    label: "ASSIGNED_SECRET",
    keepPrefix: true,
    pattern: /\b(?:password|passwd|secret|client[_-]?secret|api[_-]?key|access[_-]?token|auth[_-]?token)(["']?\s*[:=]\s*)(["'])[^"'\s]{8,}\2/gi,
  },
  // .env-style lines: OPENAI_API_KEY=abcd1234...  (whole-line, value >= 8 chars).
  {
    label: "ENV_SECRET",
    keepPrefix: true,
    pattern: /^([ \t]*(?:export[ \t]+)?[A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY)[A-Z0-9_]*[ \t]*=[ \t]*)(?!\[REDACTED)["']?[^\s"']{8,}["']?[ \t]*$/gm,
  },

  // Generic bearer token / authorization header pattern.
  {
    label: "BEARER_TOKEN",
    pattern: /\b[Bb]earer\s+[A-Za-z0-9\-_.=]{20,}/g,
  },

  // RFC1918 private/internal IPv4 ranges only — public IPs are left alone
  // since they're frequently the actual subject of security analysis.
  {
    label: "PRIVATE_IP",
    pattern: /\b(?:10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})\b/g,
  },
];

export interface RedactionResult {
  text: string;
  redactedCount: number;
  labelsFound: string[];
}

export function redactSensitiveContent(input: string): RedactionResult {
  if (!input) {
    return { text: input, redactedCount: 0, labelsFound: [] };
  }

  let text = input;
  let redactedCount = 0;
  const labelsFound = new Set<string>();

  for (const rule of RULES) {
    text = text.replace(rule.pattern, (match: string, ...groups: any[]) => {
      redactedCount++;
      labelsFound.add(rule.label);
      if (rule.keepPrefix) {
        // Groups: 1 = everything up to the value; for ASSIGNED_SECRET also 2 = quote char.
        const key = match.slice(0, match.indexOf(groups[0]) + String(groups[0]).length);
        const quote = rule.label === "ASSIGNED_SECRET" ? String(groups[1]) : "";
        return `${key}${quote}[REDACTED:${rule.label}]${quote}`;
      }
      return `[REDACTED:${rule.label}]`;
    });
  }

  return { text, redactedCount, labelsFound: Array.from(labelsFound) };
}
