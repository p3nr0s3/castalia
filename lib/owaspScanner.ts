// lib/owaspScanner.ts
//
// AI-Powered Passive Web Security Scanner aligned with:
// - OWASP Top 10 (2021)
// - OWASP Web Security Testing Guide (WSTG v4.2)
//
// Strictly passive, non-destructive, safe & legal.

import {
  OwaspCategory,
  OwaspFinding,
  OwaspHeaderSummary,
  OwaspScanResult,
  OwaspSeverity,
} from "./types";

/**
 * Normalizes user-supplied URL and validates protocol.
 */
export function normalizeTargetUrl(rawUrl: string): string {
  let cleaned = rawUrl.trim();
  // Strip quotes or brackets
  cleaned = cleaned.replace(/^[<"']+|[>"']+$/g, "");

  // If scheme is present but not http/https, reject
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(cleaned) && !/^https?:\/\//i.test(cleaned)) {
    throw new Error(`Unsupported protocol in '${cleaned}'. Only HTTP/HTTPS targets are allowed.`);
  }

  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `https://${cleaned}`;
  }

  const parsed = new URL(cleaned);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported protocol '${parsed.protocol}'. Only HTTP/HTTPS targets are allowed.`);
  }

  // Normalize path
  return parsed.origin + (parsed.pathname === "" ? "/" : parsed.pathname);
}

/**
 * Extracts Set-Cookie header strings safely across diverse environments (Node, Next.js, Fetch).
 */
export function getSetCookieHeaders(headers: Headers): string[] {
  // Check if getSetCookie exists (modern Node 18+ / standard Fetch)
  if (typeof (headers as any).getSetCookie === "function") {
    return (headers as any).getSetCookie();
  }

  // Fallback: headers.get('set-cookie') might be comma-delimited or single
  const raw = headers.get("set-cookie");
  if (!raw) return [];

  // Split on commas not part of an Expires= date
  return raw.split(/,(?=\s*[a-zA-Z0-9_\-]+=[^;])/).map((s) => s.trim());
}

/**
 * Evaluates HTTP response security headers according to OWASP Top 10 A05 & A02.
 */
export function auditSecurityHeaders(
  headers: Headers,
  isHttps: boolean
): { findings: OwaspFinding[]; summary: OwaspHeaderSummary } {
  const findings: OwaspFinding[] = [];

  const hstsHeader = headers.get("strict-transport-security");
  const cspHeader = headers.get("content-security-policy");
  const xfoHeader = headers.get("x-frame-options");
  const xctoHeader = headers.get("x-content-type-options");
  const rpHeader = headers.get("referrer-policy");
  const ppHeader = headers.get("permissions-policy") || headers.get("feature-policy");
  const acaoHeader = headers.get("access-control-allow-origin");
  const serverHeader = headers.get("server");
  const xPoweredBy = headers.get("x-powered-by");
  const xAspNet = headers.get("x-aspnet-version");

  // 1. A02:2021 - Cryptographic Failures: HTTPS & HSTS
  if (!isHttps) {
    findings.push({
      id: "hsts-plain-http",
      category: "A02:2021-Cryptographic Failures",
      title: "Unencrypted HTTP Transport",
      severity: "critical",
      status: "fail",
      description: "Target operates over plain unencrypted HTTP. Data in transit is vulnerable to eavesdropping and MITM attacks.",
      evidence: "Protocol is http://",
      recommendation: "Enforce HTTPS immediately with automated TLS redirection (e.g. Let's Encrypt / Cloudflare).",
      cwe: "CWE-319",
    });
  } else if (!hstsHeader) {
    findings.push({
      id: "hsts-missing",
      category: "A02:2021-Cryptographic Failures",
      title: "Missing HTTP Strict Transport Security (HSTS)",
      severity: "high",
      status: "fail",
      description: "HSTS header is absent. Browsers may allow unencrypted HTTP connections or SSL-stripping downgrades.",
      evidence: "Header 'Strict-Transport-Security' is missing",
      recommendation: "Add 'Strict-Transport-Security: max-age=31536000; includeSubDomains; preload' to enforce secure connections.",
      cwe: "CWE-319",
    });
  } else {
    const maxAgeMatch = hstsHeader.match(/max-age=(\d+)/i);
    const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;
    if (maxAge < 15552000) {
      findings.push({
        id: "hsts-short-duration",
        category: "A02:2021-Cryptographic Failures",
        title: "Short HSTS max-age Duration",
        severity: "low",
        status: "warn",
        description: `HSTS max-age is configured for ${maxAge} seconds (< 180 days / 15,552,000s).`,
        evidence: `Strict-Transport-Security: ${hstsHeader}`,
        recommendation: "Increase HSTS max-age to at least 31536000 (1 year) and consider 'includeSubDomains'.",
        cwe: "CWE-319",
      });
    } else {
      findings.push({
        id: "hsts-valid",
        category: "A02:2021-Cryptographic Failures",
        title: "Robust HSTS Configuration",
        severity: "info",
        status: "pass",
        description: "HSTS is properly enabled with a long max-age duration.",
        evidence: `Strict-Transport-Security: ${hstsHeader}`,
        recommendation: "Maintain current HSTS configuration.",
        cwe: "CWE-319",
      });
    }
  }

  // 2. A05:2021 - Security Misconfiguration: Content-Security-Policy (CSP)
  if (!cspHeader) {
    findings.push({
      id: "csp-missing",
      category: "A05:2021-Security Misconfiguration",
      title: "Missing Content Security Policy (CSP)",
      severity: "high",
      status: "fail",
      description: "Content Security Policy is not configured. The site lacks defense-in-depth against Cross-Site Scripting (XSS) and code injection.",
      evidence: "Header 'Content-Security-Policy' is missing",
      recommendation: "Implement a strict CSP restricting script-src, object-src, and default-src directives.",
      cwe: "CWE-1021",
    });
  } else {
    const isUnsafe = /'unsafe-inline'|'unsafe-eval'|\*\s*;/i.test(cspHeader);
    if (isUnsafe) {
      findings.push({
        id: "csp-permissive",
        category: "A05:2021-Security Misconfiguration",
        title: "Permissive CSP ('unsafe-inline' / 'unsafe-eval')",
        severity: "medium",
        status: "warn",
        description: "CSP contains 'unsafe-inline' or 'unsafe-eval', significantly diminishing defense against XSS attacks.",
        evidence: `Content-Security-Policy: ${cspHeader.slice(0, 140)}...`,
        recommendation: "Migrate inline scripts to cryptographic nonces or hashes (e.g. 'nonce-...' or 'sha256-...').",
        cwe: "CWE-79",
      });
    } else {
      findings.push({
        id: "csp-valid",
        category: "A05:2021-Security Misconfiguration",
        title: "Content Security Policy Present",
        severity: "info",
        status: "pass",
        description: "CSP is deployed without obvious unsafe-inline wildcards.",
        evidence: `CSP: ${cspHeader.slice(0, 100)}...`,
        recommendation: "Review directives periodically to keep whitelist minimal.",
        cwe: "CWE-79",
      });
    }
  }

  // 3. A05:2021 - Clickjacking Protection: X-Frame-Options / frame-ancestors
  const hasFrameAncestors = Boolean(cspHeader && /frame-ancestors/i.test(cspHeader));
  if (!xfoHeader && !hasFrameAncestors) {
    findings.push({
      id: "xfo-missing",
      category: "A05:2021-Security Misconfiguration",
      title: "Missing Clickjacking Defense (X-Frame-Options)",
      severity: "medium",
      status: "fail",
      description: "Neither X-Frame-Options nor CSP frame-ancestors is present. The application may be embedded in malicious iframes to hijack user clicks.",
      evidence: "Neither 'X-Frame-Options' nor 'frame-ancestors' header present",
      recommendation: "Send 'X-Frame-Options: DENY' or 'SAMEORIGIN', or use CSP 'frame-ancestors 'none''.",
      cwe: "CWE-1021",
    });
  } else {
    findings.push({
      id: "xfo-valid",
      category: "A05:2021-Security Misconfiguration",
      title: "Clickjacking Defense Configured",
      severity: "info",
      status: "pass",
      description: "Frame embedding is restricted via X-Frame-Options or CSP frame-ancestors.",
      evidence: xfoHeader ? `X-Frame-Options: ${xfoHeader}` : "CSP frame-ancestors configured",
      recommendation: "Ensure allowed framing domains remain strictly trusted.",
      cwe: "CWE-1021",
    });
  }

  // 4. A05:2021 - MIME-Sniffing: X-Content-Type-Options
  if (!xctoHeader || !xctoHeader.toLowerCase().includes("nosniff")) {
    findings.push({
      id: "xcto-missing",
      category: "A05:2021-Security Misconfiguration",
      title: "Missing X-Content-Type-Options: nosniff",
      severity: "low",
      status: "fail",
      description: "Missing 'X-Content-Type-Options: nosniff' permits browsers to override declared MIME types, leading to drive-by code execution.",
      evidence: xctoHeader ? `Value is '${xctoHeader}' (expected 'nosniff')` : "Header missing",
      recommendation: "Set 'X-Content-Type-Options: nosniff' on all responses.",
      cwe: "CWE-79",
    });
  } else {
    findings.push({
      id: "xcto-valid",
      category: "A05:2021-Security Misconfiguration",
      title: "MIME Sniffing Blocked",
      severity: "info",
      status: "pass",
      description: "X-Content-Type-Options is set to 'nosniff'.",
      evidence: "X-Content-Type-Options: nosniff",
      recommendation: "Maintain header configuration.",
      cwe: "CWE-79",
    });
  }

  // 5. A05:2021 - Referrer Policy
  if (!rpHeader) {
    findings.push({
      id: "referrer-policy-missing",
      category: "A05:2021-Security Misconfiguration",
      title: "Missing Referrer-Policy",
      severity: "low",
      status: "warn",
      description: "Referrer-Policy is missing. Outbound links may leak internal URL parameters, session tokens, or sensitive user paths to third parties.",
      evidence: "Header 'Referrer-Policy' is missing",
      recommendation: "Add 'Referrer-Policy: strict-origin-when-cross-origin' or 'no-referrer'.",
      cwe: "CWE-200",
    });
  } else if (/unsafe-url/i.test(rpHeader)) {
    findings.push({
      id: "referrer-policy-unsafe",
      category: "A05:2021-Security Misconfiguration",
      title: "Unsafe Referrer-Policy ('unsafe-url')",
      severity: "medium",
      status: "fail",
      description: "Referrer-Policy 'unsafe-url' unconditionally leaks full URLs including query parameters to external sites.",
      evidence: `Referrer-Policy: ${rpHeader}`,
      recommendation: "Switch to 'strict-origin-when-cross-origin'.",
      cwe: "CWE-200",
    });
  }

  // 6. A05:2021 - Permissions Policy (Feature Policy)
  if (!ppHeader) {
    findings.push({
      id: "permissions-policy-missing",
      category: "A05:2021-Security Misconfiguration",
      title: "Missing Permissions-Policy",
      severity: "low",
      status: "warn",
      description: "Permissions-Policy header is missing. Uncontrolled access to browser APIs (camera, mic, geolocation, payment) is permitted.",
      evidence: "Header 'Permissions-Policy' is missing",
      recommendation: "Set 'Permissions-Policy: camera=(), microphone=(), geolocation=()'.",
      cwe: "CWE-200",
    });
  }

  // 7. A01:2021 - Broken Access Control: CORS Wildcard
  let corsWildcard = false;
  if (acaoHeader === "*") {
    corsWildcard = true;
    findings.push({
      id: "cors-wildcard",
      category: "A01:2021-Broken Access Control",
      title: "Permissive CORS Access-Control-Allow-Origin: *",
      severity: "medium",
      status: "warn",
      description: "CORS permits any arbitrary third-party origin to read response payloads. If this endpoint returns authenticated data, unauthorized access is possible.",
      evidence: "Access-Control-Allow-Origin: *",
      recommendation: "Restrict CORS origins to trusted domains or implement strict origin validation.",
      cwe: "CWE-942",
    });
  }

  // 8. A05:2021 - Server Banner & Information Disclosure
  const banners = [
    serverHeader ? `Server: ${serverHeader}` : null,
    xPoweredBy ? `X-Powered-By: ${xPoweredBy}` : null,
    xAspNet ? `X-AspNet-Version: ${xAspNet}` : null,
  ].filter(Boolean);

  let bannerExposed: string | undefined = undefined;
  if (banners.length > 0) {
    bannerExposed = banners.join(" | ");
    // Check if contains version numbers (e.g. Apache/2.4.41 or PHP/7.4)
    const hasDetailedVersion = /\d+\.\d+/i.test(bannerExposed);
    findings.push({
      id: "server-banner-exposed",
      category: "A05:2021-Security Misconfiguration",
      title: hasDetailedVersion ? "Detailed Server Version Disclosure" : "Server Technology Banner Disclosure",
      severity: hasDetailedVersion ? "medium" : "low",
      status: "warn",
      description: `Server leaks internal technology stack details (${bannerExposed}), assisting attackers in identifying version-specific CVEs.`,
      evidence: bannerExposed,
      recommendation: "Disable or sanitize server banner headers in web server config (e.g. ServerTokens Prod, expose_php = off).",
      cwe: "CWE-200",
    });
  }

  const summary: OwaspHeaderSummary = {
    csp: Boolean(cspHeader),
    hsts: Boolean(hstsHeader),
    xFrameOptions: Boolean(xfoHeader || hasFrameAncestors),
    xContentTypeOptions: Boolean(xctoHeader && xctoHeader.toLowerCase().includes("nosniff")),
    referrerPolicy: Boolean(rpHeader && !/unsafe-url/i.test(rpHeader)),
    permissionsPolicy: Boolean(ppHeader),
    corsWildcard,
    serverBannerExposed: bannerExposed,
  };

  return { findings, summary };
}

/**
 * Evaluates Set-Cookie headers for A07:2021 Session Management & Cookie Flags.
 */
export function auditCookies(
  headers: Headers,
  isHttps: boolean
): {
  findings: OwaspFinding[];
  summary: { total: number; missingHttpOnly: number; missingSecure: number; missingSameSite: number };
} {
  const cookieStrings = getSetCookieHeaders(headers);
  const findings: OwaspFinding[] = [];

  let missingHttpOnly = 0;
  let missingSecure = 0;
  let missingSameSite = 0;

  for (const rawCookie of cookieStrings) {
    const cookieNameMatch = rawCookie.match(/^([^=]+)=/);
    const cookieName = cookieNameMatch ? cookieNameMatch[1].trim() : "unknown_cookie";

    const hasHttpOnly = /;\s*httponly\b/i.test(rawCookie);
    const hasSecure = /;\s*secure\b/i.test(rawCookie);
    const sameSiteMatch = rawCookie.match(/;\s*samesite=([a-zA-Z]+)\b/i);
    const sameSiteVal = sameSiteMatch ? sameSiteMatch[1].toLowerCase() : null;

    if (!hasHttpOnly) {
      missingHttpOnly++;
      findings.push({
        id: `cookie-no-httponly-${cookieName}`,
        category: "A07:2021-Identification and Authentication Failures",
        title: `Cookie '${cookieName}' Missing HttpOnly Flag`,
        severity: "high",
        status: "fail",
        description: `Cookie '${cookieName}' is accessible via JavaScript (document.cookie). In the event of XSS, session tokens can be exfiltrated.`,
        evidence: rawCookie.slice(0, 100),
        recommendation: `Append '; HttpOnly' to Set-Cookie '${cookieName}'.`,
        cwe: "CWE-1004",
      });
    }

    if (isHttps && !hasSecure) {
      missingSecure++;
      findings.push({
        id: `cookie-no-secure-${cookieName}`,
        category: "A02:2021-Cryptographic Failures",
        title: `Cookie '${cookieName}' Missing Secure Flag`,
        severity: "high",
        status: "fail",
        description: `Cookie '${cookieName}' is transmitted over unencrypted HTTP channels if the client initiates a cleartext request.`,
        evidence: rawCookie.slice(0, 100),
        recommendation: `Append '; Secure' to Set-Cookie '${cookieName}'.`,
        cwe: "CWE-614",
      });
    }

    if (!sameSiteVal || sameSiteVal === "none") {
      missingSameSite++;
      if (sameSiteVal === "none" && !hasSecure) {
        findings.push({
          id: `cookie-samesite-none-insecure-${cookieName}`,
          category: "A01:2021-Broken Access Control",
          title: `Cookie '${cookieName}' SameSite=None Without Secure Flag`,
          severity: "high",
          status: "fail",
          description: `Cookie '${cookieName}' specifies SameSite=None without Secure flag, violating modern browser security standards.`,
          evidence: rawCookie.slice(0, 100),
          recommendation: `Set 'SameSite=Lax' or 'SameSite=Strict', or ensure '; Secure' is paired with 'SameSite=None'.`,
          cwe: "CWE-1275",
        });
      } else {
        findings.push({
          id: `cookie-missing-samesite-${cookieName}`,
          category: "A01:2021-Broken Access Control",
          title: `Cookie '${cookieName}' Missing SameSite Attribute`,
          severity: "medium",
          status: "warn",
          description: `Cookie '${cookieName}' does not specify SameSite protection, increasing exposure to Cross-Site Request Forgery (CSRF).`,
          evidence: rawCookie.slice(0, 100),
          recommendation: `Explicitly define 'SameSite=Lax' or 'SameSite=Strict'.`,
          cwe: "CWE-1275",
        });
      }
    }
  }

  return {
    findings,
    summary: {
      total: cookieStrings.length,
      missingHttpOnly,
      missingSecure,
      missingSameSite,
    },
  };
}

/**
 * Audits HTML DOM structure for:
 * - A08:2021: Subresource Integrity (SRI) on external CDN scripts
 * - A07:2021: Password transmission & autocomplete
 * - A06:2021: Technology stack fingerprinting & outdated components
 */
export function auditHtmlDom(
  html: string,
  targetUrl: string
): { findings: OwaspFinding[]; techDetected: string[] } {
  const findings: OwaspFinding[] = [];
  const techDetected: string[] = [];

  let targetHost = "";
  try {
    targetHost = new URL(targetUrl).hostname;
  } catch {
    // ignore
  }

  // 1. A08:2021 - Subresource Integrity (SRI) Audit
  const scriptRegex = /<script\b([^>]*)src=["']([^"']+)["']([^>]*)>/gi;
  let scriptMatch: RegExpExecArray | null;
  const externalScriptsWithoutSri: string[] = [];

  const knownCdnDomains = [
    "cdnjs.cloudflare.com",
    "cdn.jsdelivr.net",
    "unpkg.com",
    "code.jquery.com",
    "stackpath.bootstrapcdn.com",
    "ajax.googleapis.com",
    "cdn.tailwindcss.com",
  ];

  while ((scriptMatch = scriptRegex.exec(html)) !== null) {
    const fullTag = scriptMatch[0];
    const srcUrl = scriptMatch[2];

    const hasIntegrity = /\bintegrity=["'][^"']+["']/i.test(fullTag);
    const isCdn = knownCdnDomains.some((cdn) => srcUrl.toLowerCase().includes(cdn));

    let isThirdParty = isCdn;
    if (!isThirdParty && /^https?:\/\//i.test(srcUrl)) {
      try {
        const scriptHost = new URL(srcUrl).hostname;
        if (scriptHost && scriptHost !== targetHost && !scriptHost.endsWith(`.${targetHost}`)) {
          isThirdParty = true;
        }
      } catch {
        // ignore
      }
    }

    if (isThirdParty && !hasIntegrity) {
      externalScriptsWithoutSri.push(srcUrl);
    }
  }

  if (externalScriptsWithoutSri.length > 0) {
    findings.push({
      id: "sri-missing",
      category: "A08:2021-Software and Data Integrity Failures",
      title: "Third-Party Scripts Missing Subresource Integrity (SRI)",
      severity: "medium",
      status: "warn",
      description: `Discovered ${externalScriptsWithoutSri.length} external third-party script(s) loaded without SRI 'integrity' hashes. If the CDN is compromised, malicious code could execute in users' browsers.`,
      evidence: `Scripts: ${externalScriptsWithoutSri.slice(0, 3).join(", ")}${externalScriptsWithoutSri.length > 3 ? "..." : ""}`,
      recommendation: "Add cryptographic SRI hashes (e.g. integrity='sha384-...' crossorigin='anonymous') to all external scripts.",
      cwe: "CWE-353",
    });
  }

  // 2. A07:2021 - Insecure Forms & Passwords
  const formRegex = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let formMatch: RegExpExecArray | null;

  while ((formMatch = formRegex.exec(html)) !== null) {
    const formAttrs = formMatch[1];
    const formBody = formMatch[2];

    const isPasswordForm = /type=["']password["']/i.test(formBody);
    const actionMatch = formAttrs.match(/action=["']([^"']*)["']/i);
    const formAction = actionMatch ? actionMatch[1] : "";
    const methodMatch = formAttrs.match(/method=["']([^"']*)["']/i);
    const formMethod = methodMatch ? methodMatch[1].toLowerCase() : "get";

    if (isPasswordForm) {
      if (formAction.startsWith("http://")) {
        findings.push({
          id: "form-password-plain-http",
          category: "A02:2021-Cryptographic Failures",
          title: "Password Form Submits to Unencrypted HTTP Action",
          severity: "critical",
          status: "fail",
          description: "A login or password form submits credentials over cleartext HTTP.",
          evidence: `Form action: ${formAction}`,
          recommendation: "Ensure form action strictly points to an HTTPS URL.",
          cwe: "CWE-319",
        });
      }

      if (formMethod === "get") {
        findings.push({
          id: "form-password-method-get",
          category: "A07:2021-Identification and Authentication Failures",
          title: "Password Form Uses GET Method",
          severity: "high",
          status: "fail",
          description: "A password input form submits via GET request, leaking credentials in URL query parameters, access logs, and browser history.",
          evidence: "Form method is GET",
          recommendation: "Change form method to POST with CSRF protection.",
          cwe: "CWE-598",
        });
      }
    }
  }

  // 3. A06:2021 - Technology & Component Fingerprinting
  // Meta generators
  const metaGenMatch = html.match(/<meta\b[^>]*name=["']generator["'][^>]*content=["']([^"']+)["']/i);
  if (metaGenMatch) {
    const gen = metaGenMatch[1];
    techDetected.push(gen);
    findings.push({
      id: "meta-generator-exposed",
      category: "A06:2021-Vulnerable and Outdated Components",
      title: "CMS/Framework Meta Generator Exposed",
      severity: "low",
      status: "warn",
      description: `Meta generator tag reveals CMS/framework: '${gen}'.`,
      evidence: `<meta name="generator" content="${gen}">`,
      recommendation: "Remove or mask meta generator tags to reduce automated fingerprinting.",
      cwe: "CWE-200",
    });
  }

  // Framework signatures
  if (/wp-content|wp-includes/i.test(html)) {
    techDetected.push("WordPress");
  }
  if (/__NEXT_DATA__|next\/router/i.test(html)) {
    techDetected.push("Next.js");
  }
  if (/data-reactroot|react-dom/i.test(html)) {
    techDetected.push("React");
  }
  if (/data-v-[a-f0-9]{8}|vue(\.min)?\.js/i.test(html)) {
    techDetected.push("Vue.js");
  }
  if (/drupal\.js|drupal\.settings/i.test(html)) {
    techDetected.push("Drupal");
  }
  if (/laravel/i.test(html)) {
    techDetected.push("Laravel");
  }

  // Outdated jQuery check
  const jqueryMatch = html.match(/jquery[.\/-](\d+\.\d+(\.\d+)?)/i);
  if (jqueryMatch) {
    const jVer = jqueryMatch[1];
    techDetected.push(`jQuery ${jVer}`);
    if (jVer.startsWith("1.") || jVer.startsWith("2.")) {
      findings.push({
        id: "outdated-jquery",
        category: "A06:2021-Vulnerable and Outdated Components",
        title: `Outdated jQuery Version (${jVer}) Detected`,
        severity: "medium",
        status: "fail",
        description: `jQuery version ${jVer} has known published Common Vulnerabilities and Exposures (CVEs) relating to Cross-Site Scripting (XSS).`,
        evidence: `Detected jQuery script: ${jqueryMatch[0]}`,
        recommendation: "Upgrade jQuery to modern v3.7+ or eliminate jQuery in favor of native DOM APIs.",
        cwe: "CWE-1104",
      });
    }
  }

  return {
    findings,
    techDetected: Array.from(new Set(techDetected)),
  };
}

/**
 * Passive endpoint checks:
 * - robots.txt (Disallowed sensitive paths)
 * - security.txt (RFC 9116 responsible disclosure)
 */
export async function fetchPassiveEndpoints(
  targetUrl: string
): Promise<{
  findings: OwaspFinding[];
  securityTxtPresent: boolean;
  robotsTxtPresent: boolean;
}> {
  const findings: OwaspFinding[] = [];
  let securityTxtPresent = false;
  let robotsTxtPresent = false;

  let origin = "";
  try {
    origin = new URL(targetUrl).origin;
  } catch {
    return { findings, securityTxtPresent, robotsTxtPresent };
  }

  // 1. Check robots.txt
  try {
    const robotsRes = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) OWASP-Scanner/1.0" },
      signal: AbortSignal.timeout(3000),
    });

    if (robotsRes.ok) {
      robotsTxtPresent = true;
      const text = await robotsRes.text();
      const sensitiveKeywords = [
        "/admin",
        "/login",
        "/backup",
        "/.git",
        "/config",
        "/internal",
        "/api/internal",
        "/phpmyadmin",
        "/wp-admin",
        "/secret",
      ];

      const exposedSensitive: string[] = [];
      const lines = text.split("\n");
      for (const line of lines) {
        const match = line.match(/^Disallow:\s*([^\s#]+)/i);
        if (match) {
          const path = match[1];
          if (sensitiveKeywords.some((kw) => path.toLowerCase().includes(kw))) {
            exposedSensitive.push(path);
          }
        }
      }

      if (exposedSensitive.length > 0) {
        findings.push({
          id: "robots-sensitive-paths",
          category: "A01:2021-Broken Access Control",
          title: "Sensitive Admin/Private Paths Disclosed in robots.txt",
          severity: "low",
          status: "warn",
          description: `robots.txt reveals ${exposedSensitive.length} sensitive/restricted application path(s). Attackers actively harvest robots.txt for hidden portals.`,
          evidence: `Disclosed paths: ${exposedSensitive.slice(0, 4).join(", ")}`,
          recommendation: "Do not rely on robots.txt for security. Enforce access control at the authentication/firewall layer.",
          cwe: "CWE-200",
        });
      }
    }
  } catch {
    // Non-fatal if robots.txt unreachable
  }

  // 2. Check /.well-known/security.txt (RFC 9116)
  try {
    const secRes = await fetch(`${origin}/.well-known/security.txt`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) OWASP-Scanner/1.0" },
      signal: AbortSignal.timeout(3000),
    });

    if (secRes.ok) {
      const text = await secRes.text();
      if (/Contact:/i.test(text)) {
        securityTxtPresent = true;
        findings.push({
          id: "security-txt-present",
          category: "A05:2021-Security Misconfiguration",
          title: "Responsible Disclosure Policy Present (RFC 9116)",
          severity: "info",
          status: "pass",
          description: "Target provides a standard /.well-known/security.txt file facilitating safe and responsible security disclosures.",
          evidence: "Contact directive found in /.well-known/security.txt",
          recommendation: "Keep contact information and PGP key valid and up-to-date.",
        });
      }
    }
  } catch {
    // Non-fatal
  }

  return { findings, securityTxtPresent, robotsTxtPresent };
}

/**
 * Calculates overall OWASP compliance security score (0-100) and letter grade.
 */
export function calculateOwaspScore(findings: OwaspFinding[]): {
  score: number;
  grade: "A+" | "A" | "B" | "C" | "D" | "F";
} {
  let score = 100;
  let hasCritical = false;
  let hasHigh = false;

  for (const f of findings) {
    if (f.status === "pass") {
      // Small bonus for strong practices
      if (f.id === "csp-valid" || f.id === "hsts-valid") score += 2;
      if (f.id === "security-txt-present") score += 3;
      continue;
    }

    switch (f.severity) {
      case "critical":
        score -= 25;
        hasCritical = true;
        break;
      case "high":
        score -= 15;
        hasHigh = true;
        break;
      case "medium":
        score -= 8;
        break;
      case "low":
        score -= 4;
        break;
      case "info":
        break;
    }
  }

  // Clamp score between 0 and 100
  score = Math.max(0, Math.min(100, Math.round(score)));

  let grade: "A+" | "A" | "B" | "C" | "D" | "F" = "F";
  if (score >= 95 && !hasCritical && !hasHigh) {
    grade = "A+";
  } else if (score >= 88 && !hasCritical) {
    grade = "A";
  } else if (score >= 75 && !hasCritical) {
    grade = "B";
  } else if (score >= 60) {
    grade = "C";
  } else if (score >= 45) {
    grade = "D";
  } else {
    grade = "F";
  }

  return { score, grade };
}

/**
 * Main orchestrator: runs complete passive OWASP Top 10 scan on target URL.
 */
export async function runOwaspScan(rawTargetUrl: string): Promise<OwaspScanResult> {
  const targetUrl = normalizeTargetUrl(rawTargetUrl);
  const isHttps = targetUrl.startsWith("https://");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    // 1. Fetch main target page
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OWASP-Scanner/1.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    const headers = res.headers;
    const htmlText = await res.text();

    // 2. Audit Headers & Cookies
    const { findings: headerFindings, summary: headersSummary } = auditSecurityHeaders(
      headers,
      isHttps
    );
    const { findings: cookieFindings, summary: cookiesSummary } = auditCookies(
      headers,
      isHttps
    );

    // 3. Audit HTML DOM
    const { findings: domFindings, techDetected } = auditHtmlDom(htmlText, targetUrl);

    // 4. Fetch Passive Endpoints (robots.txt, security.txt)
    const {
      findings: endpointFindings,
      securityTxtPresent,
      robotsTxtPresent,
    } = await fetchPassiveEndpoints(targetUrl);

    // 5. Combine findings & deduplicate
    const allFindings = [
      ...headerFindings,
      ...cookieFindings,
      ...domFindings,
      ...endpointFindings,
    ];

    // 6. Calculate Score and Grade
    const { score, grade } = calculateOwaspScore(allFindings);

    return {
      targetUrl,
      scannedAt: Date.now(),
      score,
      grade,
      headersSummary,
      cookiesSummary,
      securityTxtPresent,
      robotsTxtPresent,
      techDetected,
      findings: allFindings,
    };
  } finally {
    clearTimeout(timeout);
  }
}
