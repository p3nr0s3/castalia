import { describe, it, expect } from "vitest";
import { redactSensitiveContent } from "../lib/redaction";

const r = (t: string) => redactSensitiveContent(t);

describe("redactSensitiveContent — provider keys the app itself supports", () => {
  const cases: [string, string, string][] = [
    ["Anthropic", "sk-ant-api03-" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4", "ANTHROPIC_API_KEY"],
    ["OpenRouter", "sk-or-v1-" + "0123456789abcdef0123456789abcdef0123", "OPENROUTER_API_KEY"],
    ["OpenAI project", "sk-proj-" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6", "OPENAI_API_KEY"],
    ["Groq", "gsk_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2", "GROQ_API_KEY"],
    ["legacy sk-", "sk-" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6", "SK_API_KEY"],
    ["Hugging Face", "hf_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5", "HUGGINGFACE_TOKEN"],
    ["JWT", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk", "JWT"],
  ];
  for (const [name, secret, label] of cases) {
    it(`masks a ${name} key`, () => {
      const out = r(`here is my key ${secret} please debug`);
      expect(out.text).not.toContain(secret);
      expect(out.text).toContain(`[REDACTED:${label}]`);
      expect(out.labelsFound).toContain(label);
    });
  }
});

describe("redactSensitiveContent — assignments", () => {
  it("masks quoted values but keeps the key and quotes readable", () => {
    const out = r('const cfg = { password: "hunter2hunter2", api_key = \'abcd1234efgh\' }');
    expect(out.text).toContain('password: "[REDACTED:ASSIGNED_SECRET]"');
    expect(out.text).toContain("api_key = '[REDACTED:ASSIGNED_SECRET]'");
    expect(out.text).not.toContain("hunter2hunter2");
  });

  it("masks .env-style lines", () => {
    const out = r("DATABASE_PASSWORD=supersecretvalue\nexport STRIPE_SECRET_KEY=abcdefgh12345\nPORT=3000");
    expect(out.text).toContain("DATABASE_PASSWORD=[REDACTED:ENV_SECRET]");
    expect(out.text).toContain("export STRIPE_SECRET_KEY=[REDACTED:ENV_SECRET]");
    expect(out.text).toContain("PORT=3000");
    expect(out.text).not.toContain("supersecretvalue");
  });

  it("does NOT touch type annotations, short values, prose, or unquoted code", () => {
    for (const t of [
      "password: string;",
      'const password = "short";',
      "Reset your password from the settings page.",
      "const token = tokenizer.encode(text)",
      "API_KEY=",
      "ssh-keygen -t ed25519 -C you@example.com",
    ]) {
      expect(r(t).text, t).toBe(t);
    }
  });
});

describe("redactSensitiveContent — existing behaviour is unchanged", () => {
  it("still masks PEM private keys, AWS keys, bearer tokens and RFC1918 IPs, leaves public IPs", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----";
    const out = r(`${pem} AKIAABCDEFGHIJKLMNOP Bearer abcdefghijklmnopqrstuvwxyz 10.0.0.5 8.8.8.8`);
    expect(out.labelsFound).toEqual(expect.arrayContaining(["PRIVATE_KEY", "AWS_ACCESS_KEY", "BEARER_TOKEN", "PRIVATE_IP"]));
    expect(out.text).toContain("8.8.8.8");
    expect(out.text).not.toContain("10.0.0.5");
  });
  it("handles empty input", () => {
    expect(r("")).toEqual({ text: "", redactedCount: 0, labelsFound: [] });
  });
});
