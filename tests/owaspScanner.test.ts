import { describe, it, expect } from "vitest";
import {
  normalizeTargetUrl,
  auditSecurityHeaders,
  auditCookies,
  auditHtmlDom,
  calculateOwaspScore,
} from "../lib/owaspScanner";
import { OwaspFinding } from "../lib/types";

describe("owaspScanner utilities", () => {
  it("normalizeTargetUrl prepends https:// and strips quotes/whitespace", () => {
    expect(normalizeTargetUrl("example.com")).toBe("https://example.com/");
    expect(normalizeTargetUrl("  http://test.local/login  ")).toBe("http://test.local/login");
    expect(normalizeTargetUrl('"github.com"')).toBe("https://github.com/");
    expect(() => normalizeTargetUrl("ftp://files.example.com")).toThrow();
  });

  it("auditSecurityHeaders identifies missing security headers and info leakage", () => {
    // Insecure headers set
    const mockHeaders = new Headers({
      "server": "Apache/2.4.41 (Ubuntu)",
      "x-powered-by": "PHP/7.4.3",
      "access-control-allow-origin": "*",
    });

    const { findings, summary } = auditSecurityHeaders(mockHeaders, true);

    expect(summary.hsts).toBe(false);
    expect(summary.csp).toBe(false);
    expect(summary.xFrameOptions).toBe(false);
    expect(summary.xContentTypeOptions).toBe(false);
    expect(summary.corsWildcard).toBe(true);
    expect(summary.serverBannerExposed).toContain("Apache");

    // Findings verification
    expect(findings.some((f) => f.id === "hsts-missing")).toBe(true);
    expect(findings.some((f) => f.id === "csp-missing")).toBe(true);
    expect(findings.some((f) => f.id === "xfo-missing")).toBe(true);
    expect(findings.some((f) => f.id === "xcto-missing")).toBe(true);
    expect(findings.some((f) => f.id === "cors-wildcard")).toBe(true);
    expect(findings.some((f) => f.id === "server-banner-exposed")).toBe(true);
  });

  it("auditSecurityHeaders praises hardened security headers", () => {
    const hardenedHeaders = new Headers({
      "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
      "content-security-policy": "default-src 'self'; script-src 'self' 'nonce-r4nd0m'",
      "x-frame-options": "DENY",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "permissions-policy": "camera=(), microphone=()",
    });

    const { findings, summary } = auditSecurityHeaders(hardenedHeaders, true);

    expect(summary.hsts).toBe(true);
    expect(summary.csp).toBe(true);
    expect(summary.xFrameOptions).toBe(true);
    expect(summary.xContentTypeOptions).toBe(true);
    expect(summary.referrerPolicy).toBe(true);
    expect(summary.permissionsPolicy).toBe(true);

    expect(findings.some((f) => f.id === "hsts-valid")).toBe(true);
    expect(findings.some((f) => f.id === "csp-valid")).toBe(true);
    expect(findings.some((f) => f.id === "xfo-valid")).toBe(true);
  });

  it("auditCookies identifies missing HttpOnly, Secure, and SameSite flags", () => {
    const headers = new Headers();
    headers.append("set-cookie", "session_id=abc1234; Path=/");
    headers.append("set-cookie", "pref=dark; Path=/; Secure; HttpOnly; SameSite=Lax");

    const { findings, summary } = auditCookies(headers, true);

    expect(summary.total).toBe(2);
    expect(summary.missingHttpOnly).toBe(1);
    expect(summary.missingSecure).toBe(1);
    expect(summary.missingSameSite).toBe(1);

    expect(findings.some((f) => f.id === "cookie-no-httponly-session_id")).toBe(true);
    expect(findings.some((f) => f.id === "cookie-no-secure-session_id")).toBe(true);
    expect(findings.some((f) => f.id === "cookie-missing-samesite-session_id")).toBe(true);
  });

  it("auditHtmlDom detects missing SRI, insecure forms, and outdated libraries", () => {
    const testHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="generator" content="WordPress 5.8">
          <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/1.12.4/jquery.min.js"></script>
        </head>
        <body>
          <form action="http://insecure-login.com/auth" method="get">
            <input type="password" name="pwd">
          </form>
        </body>
      </html>
    `;

    const { findings, techDetected } = auditHtmlDom(testHtml, "https://target-app.com");

    expect(techDetected).toContain("WordPress 5.8");
    expect(techDetected).toContain("jQuery 1.12.4");

    // SRI check
    expect(findings.some((f) => f.id === "sri-missing")).toBe(true);
    // Password form over HTTP
    expect(findings.some((f) => f.id === "form-password-plain-http")).toBe(true);
    // Password form with GET method
    expect(findings.some((f) => f.id === "form-password-method-get")).toBe(true);
    // Outdated jQuery
    expect(findings.some((f) => f.id === "outdated-jquery")).toBe(true);
  });

  it("calculateOwaspScore penalizes critical and high findings with realistic letter grades", () => {
    const criticalFinding: OwaspFinding = {
      id: "hsts-plain-http",
      category: "A02:2021-Cryptographic Failures",
      title: "Unencrypted HTTP Transport",
      severity: "critical",
      status: "fail",
      description: "Operates over plain HTTP",
      recommendation: "Use HTTPS",
    };

    const highFinding: OwaspFinding = {
      id: "csp-missing",
      category: "A05:2021-Security Misconfiguration",
      title: "Missing CSP",
      severity: "high",
      status: "fail",
      description: "CSP missing",
      recommendation: "Implement CSP",
    };

    // With critical and high findings
    const res1 = calculateOwaspScore([criticalFinding, highFinding]);
    expect(res1.score).toBeLessThan(70);
    expect(res1.grade).toBe("C"); // hasCritical flags downgrade

    // With zero findings
    const res2 = calculateOwaspScore([]);
    expect(res2.score).toBe(100);
    expect(res2.grade).toBe("A+");
  });
});
