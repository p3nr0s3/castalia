/**
 * Redacts high-confidence sensitive patterns from text before it leaves this
 * app toward a cloud AI provider (Gemini, OpenAI, Claude, DeepSeek, etc).
 *
 * Scope is intentionally narrow: only patterns with low false-positive risk
 * are masked. Loose patterns (e.g. "any 12-digit number looks like a card")
 * do more harm than good for a security-analyst workflow where logs and
 * configs get pasted often — over-redaction breaks legitimate analysis.
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
    text = text.replace(rule.pattern, (match) => {
      redactedCount++;
      labelsFound.add(rule.label);
      return `[REDACTED:${rule.label}]`;
    });
  }

  return { text, redactedCount, labelsFound: Array.from(labelsFound) };
}
